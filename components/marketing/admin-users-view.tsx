'use client'

import { useState } from 'react'
import { Pencil, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react'
import {
  ADMIN_ROLE_ID,
  SUPER_ADMIN_EMAIL,
  rolesRepo,
  usersRepo,
  type User,
} from '@/lib/storage'
import { GRANTABLE_PAGES, type ViewKey } from '@/lib/permissions'
import { useToast } from '@/components/ui/toast'
import { formatDate } from './shared'

interface AdminUsersViewProps {
  currentUser: User
  onChange: () => void
}

export function AdminUsersView({ currentUser, onChange }: AdminUsersViewProps) {
  const toast = useToast()
  const users = usersRepo.all()
  const roles = rolesRepo.all()
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [form, setForm] = useState({
    prenom: '',
    nom: '',
    email: '',
    password: '',
    telephone: '',
    address: '',
    role_id: 3,
    permissions: [] as ViewKey[],
  })

  function openCreate() {
    setEditing(null)
    setForm({
      prenom: '',
      nom: '',
      email: '',
      password: '',
      telephone: '',
      address: '',
      role_id: 3,
      permissions: ['dashboard'],
    })
    setShowCreate(true)
  }

  function openEdit(u: User) {
    setEditing(u)
    setForm({
      prenom: u.prenom,
      nom: u.nom,
      email: u.email,
      password: '',
      telephone: u.telephone,
      address: u.address,
      role_id: u.role_id,
      permissions: [...u.permissions],
    })
    setShowCreate(true)
  }

  function togglePermission(key: ViewKey) {
    setForm((f) => {
      const has = f.permissions.includes(key)
      let next: ViewKey[]
      if (has) {
        if (key === 'dashboard') return f
        next = f.permissions.filter((k) => k !== key)
      } else {
        next = [...f.permissions, key]
      }
      return { ...f, permissions: next }
    })
  }

  function submit() {
    if (!form.prenom.trim() || !form.nom.trim() || !form.email.trim()) {
      toast.error('Champs requis', 'Prénom, nom et e-mail sont obligatoires.')
      return
    }
    if (editing) {
      const patch: Partial<User> = {
        prenom: form.prenom.trim(),
        nom: form.nom.trim(),
        telephone: form.telephone,
        address: form.address,
      }
      if (form.password) patch.password = form.password
      if (editing.email !== SUPER_ADMIN_EMAIL) patch.permissions = form.permissions
      const updated = usersRepo.update(editing.id, patch)
      if (!updated) {
        toast.error('Échec', 'Impossible de mettre à jour cet utilisateur.')
        return
      }
      toast.success('Utilisateur mis à jour', `${updated.prenom} ${updated.nom}`)
    } else {
      if (!form.password || form.password.length < 8) {
        toast.error('Mot de passe invalide', 'Au moins 8 caractères requis.')
        return
      }
      if (usersRepo.byEmail(form.email)) {
        toast.error('E-mail déjà utilisé', 'Un compte existe déjà avec cet e-mail.')
        return
      }
      usersRepo.create({
        prenom: form.prenom.trim(),
        nom: form.nom.trim(),
        email: form.email.trim(),
        password: form.password,
        telephone: form.telephone,
        address: form.address,
        role_id: form.role_id,
        permissions: form.permissions,
      })
      toast.success('Utilisateur créé', `${form.prenom} ${form.nom}`)
    }
    setShowCreate(false)
    onChange()
  }

  function changeRole(u: User, roleId: number) {
    const res = usersRepo.setRole(u.id, roleId)
    if (!res.ok) {
      toast.error('Changement refusé', res.error ?? 'Erreur inconnue.')
      return
    }
    toast.success('Rôle mis à jour', `${u.prenom} ${u.nom}`)
    onChange()
  }

  function removeUser(u: User) {
    if (!confirm(`Supprimer définitivement ${u.prenom} ${u.nom} ?`)) return
    const res = usersRepo.remove(u.id)
    if (!res.ok) {
      toast.error('Suppression refusée', res.error ?? 'Erreur inconnue.')
      return
    }
    toast.success('Utilisateur supprimé', `${u.prenom} ${u.nom}`)
    onChange()
  }

  function quickToggle(u: User, key: ViewKey) {
    if (u.email === SUPER_ADMIN_EMAIL) return
    const has = u.permissions.includes(key)
    const next = has ? u.permissions.filter((k) => k !== key) : [...u.permissions, key]
    const res = usersRepo.setPermissions(u.id, next)
    if (!res.ok) {
      toast.error('Accès refusé', res.error ?? 'Erreur inconnue.')
      return
    }
    toast.success(
      has ? 'Permission retirée' : 'Permission accordée',
      `${u.prenom} ${u.nom} · ${key}`,
    )
    onChange()
  }

  return (
    <section className="workspace-section">
      <div className="workspace-panel">
        <div className="workspace-panel-header">
          <h2><ShieldCheck aria-hidden="true" /> Administration — Utilisateurs</h2>
          <button type="button" className="workspace-primary" onClick={openCreate}>
            <UserPlus aria-hidden="true" /> Nouvel utilisateur
          </button>
        </div>
        <div className="campagne-table-wrap">
          <table className="campagne-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>E-mail</th>
                <th>Rôle</th>
                <th>Accès</th>
                <th>Créé le</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSuper = u.email === SUPER_ADMIN_EMAIL
                return (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.prenom} {u.nom}</strong>
                      {u.id === currentUser.id && (
                        <span className="campagne-table-desc">vous</span>
                      )}
                    </td>
                    <td>
                      {u.email}
                      {isSuper && (
                        <span className="campagne-table-desc">administrateur principal</span>
                      )}
                    </td>
                    <td>
                      <select
                        className="role-select"
                        value={u.role_id}
                        disabled={isSuper}
                        onChange={(e) => changeRole(u, Number(e.target.value))}
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id} disabled={r.id === ADMIN_ROLE_ID && !isSuper}>
                            {r.nom}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {isSuper ? (
                        <span className="permissions-admin-tag">Tous les accès</span>
                      ) : (
                        <div className="permissions-checkboxes">
                          {GRANTABLE_PAGES.map((p) => {
                            const checked = u.permissions.includes(p.key)
                            return (
                              <label
                                key={p.key}
                                className={`permission-chip${checked ? ' is-on' : ''}`}
                                title={p.label}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={p.key === 'dashboard'}
                                  onChange={() => quickToggle(u, p.key)}
                                />
                                <span>{p.label}</span>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </td>
                    <td>{formatDate(u.date_creation)}</td>
                    <td className="campagne-table-actions">
                      <button type="button" onClick={() => openEdit(u)} aria-label="Modifier">
                        <Pencil aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => removeUser(u)}
                        aria-label="Supprimer"
                        disabled={isSuper}
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <div className="workspace-modal-backdrop" onClick={() => setShowCreate(false)}>
          <div
            className="workspace-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h3>{editing ? 'Modifier l’utilisateur' : 'Nouvel utilisateur'}</h3>
              <button
                type="button"
                className="workspace-icon-button"
                onClick={() => setShowCreate(false)}
                aria-label="Fermer"
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <div className="workspace-modal-body">
              <div className="form-grid">
                <label>
                  <span>Prénom</span>
                  <input value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
                </label>
                <label>
                  <span>Nom</span>
                  <input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
                </label>
                <label className="form-grid-full">
                  <span>E-mail</span>
                  <input
                    type="email"
                    value={form.email}
                    disabled={!!editing}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </label>
                <label>
                  <span>{editing ? 'Nouveau mot de passe (optionnel)' : 'Mot de passe'}</span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </label>
                <label>
                  <span>Rôle</span>
                  <select
                    value={form.role_id}
                    disabled={!!editing && editing.email === SUPER_ADMIN_EMAIL}
                    onChange={(e) => setForm({ ...form, role_id: Number(e.target.value) })}
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id} disabled={r.id === ADMIN_ROLE_ID}>
                        {r.nom}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Téléphone</span>
                  <input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
                </label>
                <label className="form-grid-full">
                  <span>Adresse</span>
                  <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </label>
                <div className="form-grid-full">
                  <span style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 8 }}>
                    Pages autorisées
                  </span>
                  <div className="permissions-grid">
                    {GRANTABLE_PAGES.map((p) => {
                      const checked = form.permissions.includes(p.key)
                      const locked = p.key === 'dashboard'
                      return (
                        <label
                          key={p.key}
                          className={`permission-card${checked ? ' is-on' : ''}${locked ? ' is-locked' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={locked}
                            onChange={() => togglePermission(p.key)}
                          />
                          <span>{p.label}</span>
                          {locked && <em>(toujours)</em>}
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
            <footer>
              <button type="button" className="workspace-secondary" onClick={() => setShowCreate(false)}>
                Annuler
              </button>
              <button type="button" className="workspace-primary" onClick={submit}>
                {editing ? 'Enregistrer' : 'Créer l’utilisateur'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  )
}