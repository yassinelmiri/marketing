'use client'

import { useEffect, useState } from 'react'
import { Pencil, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react'
import { ADMIN_ROLE_ID, SUPER_ADMIN_EMAIL, type User, type Role } from '@/lib/storage'
import { useToast } from '@/components/ui/toast'
import { formatDate } from './shared'

interface AdminUsersViewProps {
  currentUser: User
  onChange: () => void
}

type AdminUser = Pick<User, 'id' | 'prenom' | 'nom' | 'email' | 'telephone' | 'address' | 'role_id' | 'date_creation'> & {
  permissions: User['permissions']
}

const emptyForm = {
  prenom: '',
  nom: '',
  email: '',
  password: '',
  telephone: '',
  address: '',
  role_id: 3,
}

export function AdminUsersView({ currentUser, onChange }: AdminUsersViewProps) {
  const toast = useToast()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [form, setForm] = useState(emptyForm)

  async function loadUsers() {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/users', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result.error ?? `Erreur HTTP ${response.status}: chargement impossible.`)
      }

      const rows = Array.isArray(result.users) ? result.users : []
      const roleRows = Array.isArray(result.roles) ? result.roles : []
      setUsers(rows.map((u: Omit<AdminUser, 'permissions'>) => ({
        ...u,
        id: Number(u.id),
        role_id: Number(u.role_id),
        permissions: [],
      })))
      setRoles(roleRows.map((role: Role) => ({
        ...role,
        id: Number(role.id),
      })))
      setLoadError(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Chargement impossible.'
      setLoadError(message)
      toast.error('Erreur de chargement des utilisateurs', message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers()
    // Chargement initial à l'ouverture du module.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm })
    setShowForm(true)
  }

  function openEdit(user: AdminUser) {
    setEditing(user)
    setForm({
      prenom: user.prenom,
      nom: user.nom,
      email: user.email,
      password: '',
      telephone: user.telephone,
      address: user.address,
      role_id: user.role_id,
    })
    setShowForm(true)
  }

  async function submit() {
    const prenom = form.prenom.trim()
    const nom = form.nom.trim()
    const email = form.email.trim().toLowerCase()

    if (!prenom || !nom || (!editing && !email)) {
      toast.error('Champs requis', 'Prénom, nom et e-mail sont obligatoires.')
      return
    }
    if (!editing && form.password.length < 12) {
      toast.error('Mot de passe invalide', 'Utilisez au moins 12 caractères.')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/admin/users', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : { email, password: form.password }),
          prenom,
          nom,
          telephone: form.telephone,
          address: form.address,
          role_id: form.role_id,
          ...(editing && form.password ? { password: form.password } : {}),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Enregistrement impossible.')
      toast.success(editing ? 'Utilisateur mis à jour' : 'Utilisateur créé')
      setShowForm(false)
      setForm({ ...emptyForm })
      await loadUsers()
      onChange()
    } catch (error) {
      toast.error('Échec', error instanceof Error ? error.message : 'Enregistrement impossible.')
    } finally {
      setSaving(false)
    }
  }

  async function changeRole(user: AdminUser, roleId: number) {
    const response = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: user.id,
        prenom: user.prenom,
        nom: user.nom,
        telephone: user.telephone,
        address: user.address,
        role_id: roleId,
      }),
    })
    const result = await response.json()
    if (!response.ok) {
      toast.error('Changement refusé', result.error ?? 'Erreur inconnue.')
      return
    }
    toast.success('Rôle mis à jour')
    await loadUsers()
    onChange()
  }

  async function removeUser(user: AdminUser) {
    if (!confirm(`Supprimer définitivement ${user.prenom} ${user.nom} ?`)) return
    const response = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id }),
    })
    const result = await response.json()
    if (!response.ok) {
      toast.error('Suppression refusée', result.error ?? 'Erreur inconnue.')
      return
    }
    toast.success('Utilisateur supprimé')
    await loadUsers()
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
        {loading ? (
          <div className="workspace-empty"><p>Chargement des utilisateurs…</p></div>
        ) : loadError ? (
          <div className="workspace-empty">
            <p>La liste des utilisateurs n’a pas pu être chargée.</p>
            <p className="campagne-table-desc">{loadError}</p>
            <button type="button" className="workspace-primary" onClick={() => void loadUsers()}>
              Réessayer
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="workspace-empty">
            <p>Aucun utilisateur trouvé.</p>
            <p className="campagne-table-desc">La connexion à l’API fonctionne, mais aucun profil n’est retourné par Supabase.</p>
          </div>
        ) : (
          <div className="campagne-table-wrap">
            <table className="campagne-table">
              <thead>
                <tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Créé le</th><th aria-label="Actions" /></tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isRoot = user.email.toLowerCase() === SUPER_ADMIN_EMAIL
                  return (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.prenom} {user.nom}</strong>
                        {user.id === currentUser.id && <span className="campagne-table-desc">vous</span>}
                      </td>
                      <td>
                        {user.email}
                        {isRoot && <span className="campagne-table-desc">administrateur principal</span>}
                      </td>
                      <td>
                        <select
                          className="role-select"
                          value={user.role_id}
                          disabled={isRoot}
                          onChange={(event) => void changeRole(user, Number(event.target.value))}
                        >
                          {roles.map((role) => (
                            <option key={role.id} value={role.id} disabled={role.id === ADMIN_ROLE_ID}>
                              {role.nom}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{formatDate(user.date_creation)}</td>
                      <td className="campagne-table-actions">
                        <button type="button" onClick={() => openEdit(user)} aria-label="Modifier" disabled={isRoot}>
                          <Pencil aria-hidden="true" />
                        </button>
                        <button type="button" className="danger" onClick={() => void removeUser(user)} aria-label="Supprimer" disabled={isRoot || user.id === currentUser.id}>
                          <Trash2 aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="workspace-modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <div className="workspace-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>{editing ? 'Modifier l’utilisateur' : 'Nouvel utilisateur'}</h3>
              <button type="button" className="workspace-icon-button" onClick={() => setShowForm(false)} aria-label="Fermer" disabled={saving}>
                <X aria-hidden="true" />
              </button>
            </header>
            <div className="workspace-modal-body">
              <div className="form-grid">
                <label><span>Prénom</span><input value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} /></label>
                <label><span>Nom</span><input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></label>
                <label className="form-grid-full">
                  <span>E-mail</span>
                  <input type="email" value={form.email} disabled={!!editing} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </label>
                <label className="form-grid-full">
                  <span>{editing ? 'Nouveau mot de passe (optionnel)' : 'Mot de passe temporaire (12 caractères minimum)'}</span>
                  <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </label>
                <label><span>Rôle</span>
                  <select value={form.role_id} disabled={!!editing && editing.email === SUPER_ADMIN_EMAIL} onChange={(e) => setForm({ ...form, role_id: Number(e.target.value) })}>
                    {roles.filter((role) => role.id !== ADMIN_ROLE_ID).map((role) => <option key={role.id} value={role.id}>{role.nom}</option>)}
                  </select>
                </label>
                <label><span>Téléphone</span><input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} /></label>
                <label className="form-grid-full"><span>Adresse</span><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
              </div>
              <p className="form-hint">Les autorisations d’accès sont appliquées côté serveur selon le rôle attribué. Le mot de passe n’est jamais enregistré dans la base applicative.</p>
            </div>
            <footer>
              <button type="button" className="workspace-secondary" onClick={() => setShowForm(false)} disabled={saving}>Annuler</button>
              <button type="button" className="workspace-primary" onClick={() => void submit()} disabled={saving}>
                {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer l’utilisateur'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  )
}
