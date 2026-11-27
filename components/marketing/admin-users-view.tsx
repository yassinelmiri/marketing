'use client'

import { useEffect, useMemo, useState } from 'react'
import { KeyRound, Pencil, ShieldCheck, Trash2, UserPlus, X, Check, LockKeyhole, Search, Users, Shield, RefreshCw } from 'lucide-react'
import { ADMIN_ROLE_ID, SUPER_ADMIN_EMAIL, type User, type Role } from '@/lib/storage'
import { useToast } from '@/components/ui/toast'
import { formatDate } from './shared'
import { filterAdminUsers, countAdminUsers } from '@/lib/admin/users-view-utils'

interface AdminUsersViewProps {
  currentUser: User
  onChange: () => void
}

type ModulePermission = {
  code: string
  label: string
  description: string
}

type AdminUser = Pick<User, 'id' | 'prenom' | 'nom' | 'email' | 'telephone' | 'address' | 'role_id' | 'date_creation'> & {
  permissions: string[]
}

const MODULE_PERMISSIONS: ModulePermission[] = [
  { code: 'campagne.read', label: 'Campagnes', description: 'Accéder au module et consulter les campagnes.' },
  { code: 'listes.read', label: 'Listes & contacts', description: 'Accéder aux listes et aux fiches contacts.' },
  { code: 'equipe.read', label: 'Équipe', description: 'Consulter l’espace équipe.' },
  { code: 'whatsapp.access', label: 'Bot WhatsApp', description: 'Accéder au module WhatsApp.' },
  { code: 'email.access', label: 'Envoi e-mail', description: 'Accéder au module d’envoi e-mail.' },
  { code: 'sms.access', label: 'Envoi SMS', description: 'Accéder au module d’envoi SMS.' },
]

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
  const [permissionUser, setPermissionUser] = useState<AdminUser | null>(null)
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])
  const [savingPermissions, setSavingPermissions] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  const filteredUsers = useMemo(
    () => filterAdminUsers(users, search, roleFilter),
    [users, search, roleFilter],
  )
  const adminCount = useMemo(() => countAdminUsers(users), [users])
  const memberCount = users.length - adminCount
  const permissionLabel = (code: string) => MODULE_PERMISSIONS.find((permission) => permission.code === code)?.label ?? code

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
      if (!response.ok) throw new Error(result.error ?? `Erreur HTTP ${response.status}: chargement impossible.`)

      const rows = Array.isArray(result.users) ? result.users : []
      const roleRows = Array.isArray(result.roles) ? result.roles : []
      setUsers(rows.map((u: AdminUser) => ({
        ...u,
        id: Number(u.id),
        role_id: Number(u.role_id),
        permissions: Array.isArray(u.permissions) ? u.permissions : [],
      })))
      setRoles(roleRows.map((role: Role) => ({ ...role, id: Number(role.id) })))
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

  function openPermissions(user: AdminUser) {
    setPermissionUser(user)
    setSelectedPermissions([...user.permissions])
  }

  function togglePermission(code: string) {
    setSelectedPermissions((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code],
    )
  }

  async function savePermissions() {
    if (!permissionUser) return
    setSavingPermissions(true)
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          id: permissionUser.id,
          prenom: permissionUser.prenom,
          nom: permissionUser.nom,
          email: permissionUser.email,
          telephone: permissionUser.telephone,
          address: permissionUser.address,
          role_id: permissionUser.role_id,
          permission_codes: selectedPermissions,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error ?? 'Enregistrement des autorisations impossible.')
      toast.success('Autorisations enregistrées', 'Les accès de cet utilisateur ont été mis à jour.')
      setPermissionUser(null)
      await loadUsers()
      onChange()
    } catch (error) {
      toast.error('Échec de mise à jour', error instanceof Error ? error.message : 'Erreur inconnue.')
    } finally {
      setSavingPermissions(false)
    }
  }

  async function submit() {
    const prenom = form.prenom.trim()
    const nom = form.nom.trim()
    const email = form.email.trim().toLowerCase()

    if (!prenom || !nom || !email) {
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
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          ...(editing ? { id: editing.id, email } : { email, password: form.password }),
          prenom,
          nom,
          telephone: form.telephone,
          address: form.address,
          role_id: form.role_id,
          ...(editing && form.password ? { password: form.password } : {}),
        }),
      })
      const result = await response.json().catch(() => ({}))
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
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          id: user.id,
          prenom: user.prenom,
          nom: user.nom,
          email: user.email,
          telephone: user.telephone,
          address: user.address,
          role_id: roleId,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error ?? `Erreur HTTP ${response.status}.`)
      toast.success('Rôle mis à jour')
      await loadUsers()
      onChange()
    } catch (error) {
      toast.error('Changement refusé', error instanceof Error ? error.message : 'Erreur inconnue.')
    }
  }

  async function removeUser(user: AdminUser) {
    if (!confirm(`Supprimer définitivement ${user.prenom} ${user.nom} ?`)) return
    try {
      const response = await fetch('/api/admin/users', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: user.id }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error ?? `Erreur HTTP ${response.status}.`)
      toast.success('Utilisateur supprimé')
      await loadUsers()
      onChange()
    } catch (error) {
      toast.error('Suppression refusée', error instanceof Error ? error.message : 'Erreur inconnue.')
    }
  }

  return (
    <section className="workspace-section">
      <div className="workspace-panel admin-users-panel">
        <div className="admin-users-heading">
          <div className="admin-users-title">
            <span className="data-eyebrow">GESTION DE L’ÉQUIPE</span>
            <h1><ShieldCheck aria-hidden="true" /> Utilisateurs & accès</h1>
            <p>Centralisez les comptes, attribuez les rôles et contrôlez précisément les modules accessibles.</p>
          </div>
          <button type="button" className="workspace-primary" onClick={openCreate}>
            <UserPlus aria-hidden="true" /> Nouvel utilisateur
          </button>
        </div>

        <div className="admin-users-stats">
          <article className="admin-users-stat"><span className="admin-users-stat-icon"><Users size={18}/></span><div><small>Comptes utilisateurs</small><strong>{users.length}</strong><em>Tous les profils</em></div></article>
          <article className="admin-users-stat"><span className="admin-users-stat-icon"><Shield size={18}/></span><div><small>Administrateurs</small><strong>{adminCount}</strong><em>Accès complet</em></div></article>
          <article className="admin-users-stat"><span className="admin-users-stat-icon"><KeyRound size={18}/></span><div><small>Membres</small><strong>{memberCount}</strong><em>Accès personnalisés</em></div></article>
          <article className="admin-users-stat"><span className="admin-users-stat-icon"><LockKeyhole size={18}/></span><div><small>Modules disponibles</small><strong>{MODULE_PERMISSIONS.length}</strong><em>{roles.length} rôle(s) configuré(s)</em></div></article>
        </div>

        <div className="admin-users-toolbar">
          <label className="admin-users-search">
            <Search size={17} aria-hidden="true"/>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un nom, un e-mail ou un téléphone…" />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Effacer la recherche"><X size={14}/></button>}
          </label>
          <label className="admin-users-role-filter">
            <span>Rôle</span>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="all">Tous les rôles</option>
              {roles.map((role) => <option key={role.id} value={String(role.id)}>{role.nom}</option>)}
            </select>
          </label>
          <button type="button" className="workspace-secondary admin-users-refresh" onClick={() => void loadUsers()} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'admin-users-spinning' : ''}/> Actualiser
          </button>
          <span className="admin-users-results">{filteredUsers.length} / {users.length} utilisateur(s)</span>
        </div>

        {loading ? (
          <div className="workspace-empty"><p>Chargement des utilisateurs…</p></div>
        ) : loadError ? (
          <div className="workspace-empty">
            <p>La liste des utilisateurs n’a pas pu être chargée.</p>
            <p className="campagne-table-desc">{loadError}</p>
            <button type="button" className="workspace-primary" onClick={() => void loadUsers()}>Réessayer</button>
          </div>
        ) : users.length === 0 ? (
          <div className="workspace-empty">
            <p>{search || roleFilter !== 'all' ? 'Aucun utilisateur ne correspond à ces filtres.' : 'Aucun utilisateur trouvé.'}</p>
            <p className="campagne-table-desc">La connexion à l’API fonctionne, mais aucun profil n’est retourné par Supabase.</p>
          </div>
        ) : (
          <div className="campagne-table-wrap">
            <table className="campagne-table">
              <thead>
                <tr><th>Utilisateur</th><th>E-mail</th><th>Rôle</th><th>Modules actifs</th><th>Créé le</th><th aria-label="Actions" /></tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const isRoot = user.email.toLowerCase() === SUPER_ADMIN_EMAIL
                  const isAdmin = user.role_id === ADMIN_ROLE_ID
                  return (
                    <tr key={user.id}>
                      <td>
                        <div className="admin-user-identity">
                          <span className="admin-user-avatar">{user.prenom?.charAt(0)}{user.nom?.charAt(0)}</span>
                          <span><strong>{user.prenom} {user.nom}</strong>{user.id === currentUser.id && <small>Votre compte</small>}</span>
                        </div>
                      </td>
                      <td>
                        {user.email}
                        {isRoot && <span className="campagne-table-desc">Administrateur principal</span>}
                      </td>
                      <td>
                        <select
                          className="role-select"
                          value={user.role_id}
                          disabled={isRoot}
                          onChange={(event) => void changeRole(user, Number(event.target.value))}
                          aria-label={`Rôle de ${user.prenom} ${user.nom}`}
                        >
                          {roles.map((role) => (
                            <option key={role.id} value={role.id} disabled={role.id === ADMIN_ROLE_ID && !isRoot}>
                              {role.nom}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {isAdmin ? (
                          <span className="admin-permission-summary is-admin"><ShieldCheck size={13}/> Tous les modules</span>
                        ) : (
                          <div className="admin-permission-cell">
                            <span className="admin-permission-summary">{user.permissions.length} / {MODULE_PERMISSIONS.length} autorisés</span>
                            <div className="admin-permission-tags">
                              {user.permissions.slice(0, 3).map((code) => <span key={code}>{permissionLabel(code)}</span>)}
                              {user.permissions.length > 3 && <span>+{user.permissions.length - 3}</span>}
                              {user.permissions.length === 0 && <span className="is-empty">Aucun accès</span>}
                            </div>
                          </div>
                        )}
                      </td>
                      <td>{formatDate(user.date_creation)}</td>
                      <td className="campagne-table-actions">
                        {!isAdmin && (
                          <button type="button" onClick={() => openPermissions(user)} aria-label="Gérer les autorisations" title="Gérer les autorisations">
                            <KeyRound aria-hidden="true" />
                          </button>
                        )}
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

      {permissionUser && (
        <div className="workspace-modal-backdrop" onClick={() => !savingPermissions && setPermissionUser(null)}>
          <div className="workspace-modal" role="dialog" aria-modal="true" aria-labelledby="permission-dialog-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h3 id="permission-dialog-title"><LockKeyhole aria-hidden="true" /> Autorisations d’accès</h3>
                <p className="campagne-table-desc">{permissionUser.prenom} {permissionUser.nom} · {permissionUser.email}</p>
              </div>
              <button type="button" className="workspace-icon-button" onClick={() => setPermissionUser(null)} aria-label="Fermer" disabled={savingPermissions}><X aria-hidden="true" /></button>
            </header>
            <div className="workspace-modal-body">
              <div className="permissions-modal-toolbar">
                <p className="form-hint">Activez uniquement les modules nécessaires à cet utilisateur.</p>
                <button type="button" className="workspace-secondary" onClick={() => setSelectedPermissions(MODULE_PERMISSIONS.map((item) => item.code))}>Tout autoriser</button>
              </div>
              <div className="permissions-modal-list">
                {MODULE_PERMISSIONS.map((permission) => {
                  const checked = selectedPermissions.includes(permission.code)
                  return (
                    <label key={permission.code} className={`permissions-modal-option${checked ? ' is-selected' : ''}`}>
                      <input type="checkbox" checked={checked} onChange={() => togglePermission(permission.code)} />
                      <span className="permissions-modal-copy">
                        <strong>{permission.label}{checked && <Check size={15} aria-hidden="true" />}</strong>
                        <span>{permission.description}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
              <p className="form-hint">Les choix enregistrés remplacent les autorisations héritées du rôle pour ces modules. Le compte administrateur principal reste protégé.</p>
            </div>
            <footer>
              <button type="button" className="workspace-secondary" onClick={() => setPermissionUser(null)} disabled={savingPermissions}>Annuler</button>
              <button type="button" className="workspace-primary" onClick={() => void savePermissions()} disabled={savingPermissions}>
                {savingPermissions ? 'Enregistrement…' : 'Enregistrer les accès'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {showForm && (
        <div className="workspace-modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <div className="workspace-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>{editing ? 'Modifier l’utilisateur' : 'Nouvel utilisateur'}</h3>
              <button type="button" className="workspace-icon-button" onClick={() => setShowForm(false)} aria-label="Fermer" disabled={saving}><X aria-hidden="true" /></button>
            </header>
            <div className="workspace-modal-body">
              <div className="form-grid">
                <label><span>Prénom</span><input value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} /></label>
                <label><span>Nom</span><input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></label>
                <label className="form-grid-full"><span>E-mail</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
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
              <p className="form-hint">Après création, ouvrez « Gérer les autorisations » pour choisir les modules accessibles. Le mot de passe n’est jamais enregistré dans la base applicative.</p>
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
