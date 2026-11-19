// lib/storage.ts
// Couche de persistance locale (LocalStorage).
// Aligné sur le diagramme de classes SANS BaseContact :
// User · Role · Permission · RolePermission
// ListeContact · Contact · ListeContactContact
// TypeCampagne · Campagne · CampagneListe · Commentaire

import {
  DEFAULT_MEMBER_PERMISSIONS,
  GRANTABLE_PAGES,
  sanitizePermissions,
  type ViewKey,
} from './permissions'

// ============================================================
// TYPES — Utilisateurs & rôles
// ============================================================

export interface User {
  id: number
  prenom: string
  nom: string
  email: string
  password: string
  telephone: string
  address: string
  role_id: number
  date_creation: string
  date_dernier_login: string | null
  ip_address: string | null
  permissions: ViewKey[]
}

export interface Role {
  id: number
  nom: string
  description: string
}

export interface Permission {
  id: number
  nom: string
  code: string
  description: string
}

export interface RolePermission {
  id: number
  role_id: number
  permission_id: number
}

// ============================================================
// TYPES — Contacts & listes (SANS BaseContact)
// ============================================================

export interface ListeContact {
  id: number
  nom: string
  description: string
  cible: string
  note: string
  ajoute_par_nom: string
  date_creation: string
  date_modification: string
  /** ID de l'utilisateur qui a créé la liste. */
  created_by: number
}

export interface Contact {
  id: number
  nom: string
  prenom: string
  reseau_social: string
  telephone: string
  mobile: string
  address: string
  code_postal: string
  ville: string
  email: string
  profile: string
  date_creation: string
  date_modification: string
  created_by: number
  commentaire: string
}

export interface ListeContactContact {
  id: number
  liste_id: number
  contact_id: number
  date_ajout: string
}

// ============================================================
// TYPES — Campagnes
// ============================================================

export type CampagneStatus = 'brouillon' | 'en_cours' | 'terminee' | 'archivee'

export const CAMPAGNE_STATUS_LABELS: Record<CampagneStatus, string> = {
  brouillon: 'Brouillon',
  en_cours: 'En cours',
  terminee: 'Terminée',
  archivee: 'Archivée',
}

export interface TypeCampagne {
  id: number
  nom: string
  code: string
  description: string
  icone: string
  actif: boolean
  date_creation: string
  created_by: number
}

export interface Campagne {
  id: number
  type_campagne_id: number
  user_id: number
  titre: string
  cible: string
  note: string
  status: CampagneStatus
  date_creation: string
  date_modification: string
}

export interface CampagneListe {
  id: number
  campagne_id: number
  liste_id: number
  date_ajout: string
}

export interface Commentaire {
  id: number
  campagne_id: number
  user_id: number
  contenu: string
  date_creation: string
}

// ============================================================
// CONSTANTES
// ============================================================

export const SUPER_ADMIN_EMAIL = 'admin@anntel.com'
export const ADMIN_ROLE_ID = 1

// ============================================================
// STORAGE
// ============================================================

const KEYS = {
  users: 'anntel.users',
  roles: 'anntel.roles',
  permissions: 'anntel.permissions',
  rolePermissions: 'anntel.role_permissions',
  listes: 'anntel.listes',
  contacts: 'anntel.contacts',
  listeContacts: 'anntel.liste_contacts',
  typeCampagnes: 'anntel.type_campagnes',
  campagnes: 'anntel.campagnes',
  campagneListes: 'anntel.campagne_listes',
  commentaires: 'anntel.commentaires',
  session: 'anntel.session',
  counters: 'anntel.counters',
  initialized: 'anntel.initialized.v7',
} as const

type Counters = Record<string, number>

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function read<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T) {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.warn('[storage] write failed', key, e)
  }
}

function nextId(entity: string): number {
  const counters = read<Counters>(KEYS.counters, {})
  const current = counters[entity] ?? 0
  const next = current + 1
  counters[entity] = next
  write(KEYS.counters, counters)
  return next
}

// ============================================================
// SEEDS
// ============================================================

const ROLES_SEED: Role[] = [
  { id: 1, nom: 'admin', description: 'Administrateur de la plateforme' },
  { id: 2, nom: 'manager', description: 'Gestionnaire de campagnes' },
  { id: 3, nom: 'membre', description: 'Membre de l’équipe marketing' },
]

const PERMISSIONS_SEED: Permission[] = [
  { id: 1, nom: 'Créer une campagne', code: 'campagne.create', description: '' },
  { id: 2, nom: 'Modifier une campagne', code: 'campagne.update', description: '' },
  { id: 3, nom: 'Supprimer une campagne', code: 'campagne.delete', description: '' },
  { id: 4, nom: 'Voir les campagnes', code: 'campagne.read', description: '' },
  { id: 5, nom: 'Gérer les utilisateurs', code: 'user.manage', description: '' },
  { id: 6, nom: 'Gérer les rôles', code: 'role.manage', description: '' },
]

const ROLE_PERMISSIONS_SEED: RolePermission[] = [
  { id: 1, role_id: 1, permission_id: 1 },
  { id: 2, role_id: 1, permission_id: 2 },
  { id: 3, role_id: 1, permission_id: 3 },
  { id: 4, role_id: 1, permission_id: 4 },
  { id: 5, role_id: 1, permission_id: 5 },
  { id: 6, role_id: 1, permission_id: 6 },
  { id: 7, role_id: 2, permission_id: 1 },
  { id: 8, role_id: 2, permission_id: 2 },
  { id: 9, role_id: 2, permission_id: 4 },
  { id: 10, role_id: 3, permission_id: 4 },
]

const TYPE_CAMPAGNES_SEED: TypeCampagne[] = [
  { id: 1, nom: 'E-mail', code: 'email', description: 'Campagnes e-mail', icone: 'mail', actif: true, date_creation: new Date().toISOString(), created_by: 1 },
  { id: 2, nom: 'SMS', code: 'sms', description: 'Campagnes SMS', icone: 'smartphone', actif: true, date_creation: new Date().toISOString(), created_by: 1 },
  { id: 3, nom: 'WhatsApp', code: 'whatsapp', description: 'Campagnes WhatsApp', icone: 'message-circle', actif: true, date_creation: new Date().toISOString(), created_by: 1 },
  { id: 4, nom: 'Réseau social', code: 'reseau_social', description: 'Facebook, Instagram, LinkedIn, etc.', icone: 'share-2', actif: true, date_creation: new Date().toISOString(), created_by: 1 },
]

const ADMIN_SEED = {
  prenom: 'Admin',
  nom: 'Anntel',
  email: SUPER_ADMIN_EMAIL,
  password: 'admin1234',
  role_id: ADMIN_ROLE_ID,
}

function migrateUsers(raw: User[]): User[] {
  return raw.map((u) => {
    const isSuper = u.email === SUPER_ADMIN_EMAIL
    let perms: ViewKey[] = Array.isArray((u as any).permissions)
      ? sanitizePermissions((u as any).permissions)
      : isSuper
        ? GRANTABLE_PAGES.map((p) => p.key)
        : [...DEFAULT_MEMBER_PERMISSIONS]
    perms = perms.map((p: string) => (p === 'admin_users' ? 'admin-users' : p)) as ViewKey[]
    return { ...u, permissions: perms }
  })
}

/** Migration des listes (suppression de base_id → created_by conservé). */
function migrateListes(raw: any[]): ListeContact[] {
  return raw.map((l) => ({
    id: l.id,
    nom: l.nom ?? '',
    description: l.description ?? '',
    cible: l.cible ?? '',
    note: l.note ?? '',
    ajoute_par_nom: l.ajoute_par_nom ?? '',
    date_creation: l.date_creation ?? new Date().toISOString(),
    date_modification: l.date_modification ?? l.date_creation ?? new Date().toISOString(),
    created_by: l.created_by ?? 1,
  }))
}

export function initStorage() {
  if (!isBrowser()) return

  try {
    let users = read<User[]>(KEYS.users, [])
    if (users.length > 0) {
      users = migrateUsers(users)
      write(KEYS.users, users)
    }

    let listes = read<any[]>(KEYS.listes, [])
    if (listes.length > 0) {
      listes = migrateListes(listes)
      write(KEYS.listes, listes)
    }

    const already = window.localStorage.getItem(KEYS.initialized)
    if (already === '1') return

    if (!window.localStorage.getItem(KEYS.roles)) write(KEYS.roles, ROLES_SEED)
    if (!window.localStorage.getItem(KEYS.permissions)) write(KEYS.permissions, PERMISSIONS_SEED)
    if (!window.localStorage.getItem(KEYS.rolePermissions)) write(KEYS.rolePermissions, ROLE_PERMISSIONS_SEED)
    if (!window.localStorage.getItem(KEYS.typeCampagnes)) write(KEYS.typeCampagnes, TYPE_CAMPAGNES_SEED)
    if (!window.localStorage.getItem(KEYS.listes)) write(KEYS.listes, [])
    if (!window.localStorage.getItem(KEYS.contacts)) write(KEYS.contacts, [])
    if (!window.localStorage.getItem(KEYS.listeContacts)) write(KEYS.listeContacts, [])
    if (!window.localStorage.getItem(KEYS.campagnes)) write(KEYS.campagnes, [])
    if (!window.localStorage.getItem(KEYS.campagneListes)) write(KEYS.campagneListes, [])
    if (!window.localStorage.getItem(KEYS.commentaires)) write(KEYS.commentaires, [])

    const counters = read<Counters>(KEYS.counters, {})
    for (const r of ROLES_SEED) counters.roles = Math.max(counters.roles ?? 0, r.id)
    for (const p of PERMISSIONS_SEED) counters.permissions = Math.max(counters.permissions ?? 0, p.id)
    for (const rp of ROLE_PERMISSIONS_SEED) counters.role_permissions = Math.max(counters.role_permissions ?? 0, rp.id)
    for (const tc of TYPE_CAMPAGNES_SEED) counters.type_campagnes = Math.max(counters.type_campagnes ?? 0, tc.id)
    write(KEYS.counters, counters)

    const hasAdmin = users.some((u) => u.email === SUPER_ADMIN_EMAIL)
    if (!hasAdmin) {
      const adminId = nextId('users')
      const admin: User = {
        id: adminId,
        prenom: ADMIN_SEED.prenom,
        nom: ADMIN_SEED.nom,
        email: ADMIN_SEED.email,
        password: ADMIN_SEED.password,
        telephone: '',
        address: '',
        role_id: ADMIN_SEED.role_id,
        date_creation: new Date().toISOString(),
        date_dernier_login: null,
        ip_address: null,
        permissions: GRANTABLE_PAGES.map((p) => p.key),
      }
      const fixed = users.map((u) =>
        u.role_id === ADMIN_ROLE_ID && u.email !== SUPER_ADMIN_EMAIL ? { ...u, role_id: 2 } : u,
      )
      write(KEYS.users, [...fixed, admin])
    }

    window.localStorage.setItem(KEYS.initialized, '1')
  } catch (e) {
    console.error('[initStorage] failed', e)
  }
}

// ============================================================
// REPOS — Rôles & permissions
// ============================================================

export const rolesRepo = {
  all: () => read<Role[]>(KEYS.roles, []),
  byId: (id: number) => rolesRepo.all().find((r) => r.id === id) ?? null,
  byName: (nom: string) => rolesRepo.all().find((r) => r.nom === nom) ?? null,
}

export const permissionsRepo = {
  all: () => read<Permission[]>(KEYS.permissions, []),
  forRole: (roleId: number) => {
    const links = rolePermissionsRepo.all().filter((rp) => rp.role_id === roleId)
    const ids = new Set(links.map((l) => l.permission_id))
    return permissionsRepo.all().filter((p) => ids.has(p.id))
  },
}

export const rolePermissionsRepo = {
  all: () => read<RolePermission[]>(KEYS.rolePermissions, []),
}

// ============================================================
// REPOS — Utilisateurs
// ============================================================

export const usersRepo = {
  all: () => migrateUsers(read<User[]>(KEYS.users, [])),
  byId: (id: number) => usersRepo.all().find((u) => u.id === id) ?? null,
  byEmail: (email: string) => {
    const needle = email.trim().toLowerCase()
    return usersRepo.all().find((u) => u.email.toLowerCase() === needle) ?? null
  },
  isAdmin: (u: User | null | undefined) =>
    !!u && u.email === SUPER_ADMIN_EMAIL && u.role_id === ADMIN_ROLE_ID,

  canAccess: (u: User | null | undefined, view: ViewKey) => {
    if (!u) return false
    if (usersRepo.isAdmin(u)) return true
    if (view === 'admin-users') return false
    return u.permissions.includes(view)
  },

  create(data: {
    prenom: string
    nom: string
    email: string
    password: string
    telephone?: string
    address?: string
    role_id?: number
    permissions?: ViewKey[]
  }): User {
    const users = usersRepo.all()
    const email = data.email.trim().toLowerCase()
    const role_id = data.role_id ?? 3
    const safeRole = role_id === ADMIN_ROLE_ID ? 2 : role_id
    const perms = data.permissions
      ? sanitizePermissions(data.permissions)
      : [...DEFAULT_MEMBER_PERMISSIONS]
    const id = nextId('users')
    const user: User = {
      id,
      prenom: data.prenom,
      nom: data.nom,
      email,
      password: data.password,
      telephone: data.telephone ?? '',
      address: data.address ?? '',
      role_id: safeRole,
      date_creation: new Date().toISOString(),
      date_dernier_login: null,
      ip_address: null,
      permissions: perms,
    }
    users.push(user)
    write(KEYS.users, users)
    return user
  },

  update(id: number, patch: Partial<User>): User | null {
    const users = usersRepo.all()
    const idx = users.findIndex((u) => u.id === id)
    if (idx === -1) return null
    const target = users[idx]

    if (target.email === SUPER_ADMIN_EMAIL) {
      const filteredPatch: Partial<User> = { ...patch }
      delete filteredPatch.email
      if ('role_id' in filteredPatch) delete filteredPatch.role_id
      if ('permissions' in filteredPatch) delete filteredPatch.permissions
      users[idx] = { ...target, ...filteredPatch }
    } else {
      const safePatch: Partial<User> = { ...patch }
      if (safePatch.role_id === ADMIN_ROLE_ID) safePatch.role_id = 2
      if (safePatch.email && safePatch.email.toLowerCase() === SUPER_ADMIN_EMAIL) {
        delete safePatch.email
      }
      if (safePatch.permissions) {
        safePatch.permissions = sanitizePermissions(safePatch.permissions)
      }
      users[idx] = { ...target, ...safePatch }
    }
    write(KEYS.users, users)
    return users[idx]
  },

  setRole(id: number, roleId: number): { ok: boolean; error?: string; user?: User } {
    const target = usersRepo.byId(id)
    if (!target) return { ok: false, error: 'Utilisateur introuvable.' }
    if (target.email === SUPER_ADMIN_EMAIL) {
      return { ok: false, error: 'Impossible de modifier le rôle de l’administrateur principal.' }
    }
    if (roleId === ADMIN_ROLE_ID) {
      return { ok: false, error: 'Un seul administrateur est autorisé.' }
    }
    const updated = usersRepo.update(id, { role_id: roleId })
    if (!updated) return { ok: false, error: 'Échec de la mise à jour.' }
    return { ok: true, user: updated }
  },

  setPermissions(id: number, permissions: ViewKey[]): { ok: boolean; error?: string; user?: User } {
    const target = usersRepo.byId(id)
    if (!target) return { ok: false, error: 'Utilisateur introuvable.' }
    if (target.email === SUPER_ADMIN_EMAIL) {
      return { ok: false, error: 'L’administrateur principal a tous les droits.' }
    }
    const updated = usersRepo.update(id, { permissions: sanitizePermissions(permissions) })
    if (!updated) return { ok: false, error: 'Échec de la mise à jour.' }
    return { ok: true, user: updated }
  },

  remove(id: number): { ok: boolean; error?: string } {
    const target = usersRepo.byId(id)
    if (!target) return { ok: false, error: 'Utilisateur introuvable.' }
    if (target.email === SUPER_ADMIN_EMAIL) {
      return { ok: false, error: 'L’administrateur principal ne peut pas être supprimé.' }
    }
    const users = usersRepo.all().filter((u) => u.id !== id)
    write(KEYS.users, users)
    return { ok: true }
  },

  touchLogin(id: number): User | null {
    return usersRepo.update(id, {
      date_dernier_login: new Date().toISOString(),
    })
  },
}

// ============================================================
// REPOS — Listes de contacts (SANS BASE)
// ============================================================

export const listesRepo = {
  all: () => migrateListes(read<any[]>(KEYS.listes, [])),
  byId: (id: number) => listesRepo.all().find((l) => l.id === id) ?? null,
  byUser: (userId: number) => listesRepo.all().filter((l) => l.created_by === userId),

  create(data: {
    nom: string
    description: string
    cible?: string
    note?: string
    ajoute_par_nom?: string
    date_creation?: string
    created_by: number
  }): ListeContact {
    const items = listesRepo.all()
    const now = new Date().toISOString()
    const liste: ListeContact = {
      id: nextId('listes'),
      nom: data.nom.trim(),
      description: data.description,
      cible: data.cible ?? '',
      note: data.note ?? '',
      ajoute_par_nom: data.ajoute_par_nom ?? '',
      date_creation: data.date_creation ?? now,
      date_modification: now,
      created_by: data.created_by,
    }
    items.push(liste)
    write(KEYS.listes, items)
    return liste
  },

  update(id: number, patch: Partial<Omit<ListeContact, 'id' | 'created_by'>>): ListeContact | null {
    const items = listesRepo.all()
    const idx = items.findIndex((l) => l.id === id)
    if (idx === -1) return null
    items[idx] = {
      ...items[idx],
      ...patch,
      date_modification: new Date().toISOString(),
    }
    write(KEYS.listes, items)
    return items[idx]
  },

  remove(id: number): { ok: boolean; error?: string } {
    const links = listeContactsRepo.all().filter((lc) => lc.liste_id !== id)
    write(KEYS.listeContacts, links)

    const campagneLinks = campagneListesRepo.all().filter((cl) => cl.liste_id !== id)
    write(KEYS.campagneListes, campagneLinks)

    const items = listesRepo.all().filter((l) => l.id !== id)
    write(KEYS.listes, items)
    return { ok: true }
  },

  contactsOf: (listeId: number): Contact[] => {
    const links = listeContactsRepo.all().filter((lc) => lc.liste_id === listeId)
    const ids = new Set(links.map((l) => l.contact_id))
    return contactsRepo.all().filter((c) => ids.has(c.id))
  },

  addContact(listeId: number, contactId: number): ListeContactContact {
    const existing = listeContactsRepo
      .all()
      .find((lc) => lc.liste_id === listeId && lc.contact_id === contactId)
    if (existing) return existing
    const link: ListeContactContact = {
      id: nextId('liste_contacts'),
      liste_id: listeId,
      contact_id: contactId,
      date_ajout: new Date().toISOString(),
    }
    const items = listeContactsRepo.all()
    items.push(link)
    write(KEYS.listeContacts, items)
    return link
  },

  removeContact(listeId: number, contactId: number) {
    const items = listeContactsRepo
      .all()
      .filter((lc) => !(lc.liste_id === listeId && lc.contact_id === contactId))
    write(KEYS.listeContacts, items)
  },
}

// ============================================================
// REPOS — Contacts
// ============================================================

export const contactsRepo = {
  all: () => read<Contact[]>(KEYS.contacts, []),
  byId: (id: number) => contactsRepo.all().find((c) => c.id === id) ?? null,

  create(data: Omit<Contact, 'id' | 'date_creation' | 'date_modification'>): Contact {
    const items = contactsRepo.all()
    const now = new Date().toISOString()
    const contact: Contact = {
      ...data,
      id: nextId('contacts'),
      date_creation: now,
      date_modification: now,
    }
    items.push(contact)
    write(KEYS.contacts, items)
    return contact
  },

  update(id: number, patch: Partial<Omit<Contact, 'id' | 'date_creation'>>): Contact | null {
    const items = contactsRepo.all()
    const idx = items.findIndex((c) => c.id === id)
    if (idx === -1) return null
    items[idx] = {
      ...items[idx],
      ...patch,
      date_modification: new Date().toISOString(),
    }
    write(KEYS.contacts, items)
    return items[idx]
  },

  remove(id: number): boolean {
    const links = listeContactsRepo.all().filter((lc) => lc.contact_id !== id)
    write(KEYS.listeContacts, links)
    const items = contactsRepo.all().filter((c) => c.id !== id)
    write(KEYS.contacts, items)
    return true
  },

  bulkCreate(
    listeId: number,
    userId: number,
    rows: Array<Partial<Contact>>,
  ): { created: number; errors: string[] } {
    const items = contactsRepo.all()
    const counters = read<Counters>(KEYS.counters, {})
    let nextIdVal = counters.contacts ?? 0
    const errors: string[] = []
    let created = 0
    const now = new Date().toISOString()

    rows.forEach((row, index) => {
      const email = (row.email ?? '').toString().trim().toLowerCase()
      const nom = (row.nom ?? '').toString().trim()
      if (!nom && !email) {
        errors.push(`Ligne ${index + 2} : nom ou email requis.`)
        return
      }
      nextIdVal += 1
      const contact: Contact = {
        id: nextIdVal,
        nom,
        prenom: (row.prenom ?? '').toString(),
        reseau_social: (row.reseau_social ?? '').toString(),
        telephone: (row.telephone ?? '').toString(),
        mobile: (row.mobile ?? '').toString(),
        address: (row.address ?? '').toString(),
        code_postal: (row.code_postal ?? '').toString(),
        ville: (row.ville ?? '').toString(),
        email,
        profile: (row.profile ?? '').toString(),
        date_creation: now,
        date_modification: now,
        created_by: userId,
        commentaire: (row.commentaire ?? '').toString(),
      }
      items.push(contact)
      const link: ListeContactContact = {
        id: nextId('liste_contacts'),
        liste_id: listeId,
        contact_id: contact.id,
        date_ajout: now,
      }
      const links = listeContactsRepo.all()
      links.push(link)
      write(KEYS.listeContacts, links)
      created += 1
    })

    counters.contacts = nextIdVal
    write(KEYS.counters, counters)
    write(KEYS.contacts, items)
    return { created, errors }
  },
}

// ============================================================
// REPOS — Liens liste-contact
// ============================================================

export const listeContactsRepo = {
  all: () => read<ListeContactContact[]>(KEYS.listeContacts, []),
  byListe: (listeId: number) => listeContactsRepo.all().filter((lc) => lc.liste_id === listeId),
}

// ============================================================
// REPOS — Types de campagnes
// ============================================================

export const typeCampagnesRepo = {
  all: () => read<TypeCampagne[]>(KEYS.typeCampagnes, []),
  byId: (id: number) => typeCampagnesRepo.all().find((t) => t.id === id) ?? null,
  byCode: (code: string) => typeCampagnesRepo.all().find((t) => t.code === code) ?? null,
  actifs: () => typeCampagnesRepo.all().filter((t) => t.actif),
}

// ============================================================
// REPOS — Campagnes
// ============================================================

export const campagnesRepo = {
  all: () => read<Campagne[]>(KEYS.campagnes, []),
  byId: (id: number) => campagnesRepo.all().find((c) => c.id === id) ?? null,
  byUser: (userId: number) => campagnesRepo.all().filter((c) => c.user_id === userId),

  create(data: Omit<Campagne, 'id' | 'date_creation' | 'date_modification'>): Campagne {
    const items = campagnesRepo.all()
    const now = new Date().toISOString()
    const item: Campagne = {
      ...data,
      id: nextId('campagnes'),
      date_creation: now,
      date_modification: now,
    }
    items.push(item)
    write(KEYS.campagnes, items)
    return item
  },

  update(id: number, patch: Partial<Omit<Campagne, 'id' | 'date_creation'>>): Campagne | null {
    const items = campagnesRepo.all()
    const idx = items.findIndex((c) => c.id === id)
    if (idx === -1) return null
    items[idx] = {
      ...items[idx],
      ...patch,
      date_modification: new Date().toISOString(),
    }
    write(KEYS.campagnes, items)
    return items[idx]
  },

  remove(id: number) {
    const links = campagneListesRepo.all().filter((cl) => cl.campagne_id !== id)
    write(KEYS.campagneListes, links)
    const comments = commentairesRepo.all().filter((c) => c.campagne_id !== id)
    write(KEYS.commentaires, comments)
    const items = campagnesRepo.all().filter((c) => c.id !== id)
    write(KEYS.campagnes, items)
  },

  attachListe(campagneId: number, listeId: number): CampagneListe {
    const existing = campagneListesRepo
      .all()
      .find((cl) => cl.campagne_id === campagneId && cl.liste_id === listeId)
    if (existing) return existing
    const link: CampagneListe = {
      id: nextId('campagne_listes'),
      campagne_id: campagneId,
      liste_id: listeId,
      date_ajout: new Date().toISOString(),
    }
    const items = campagneListesRepo.all()
    items.push(link)
    write(KEYS.campagneListes, items)
    return link
  },

  detachListe(campagneId: number, listeId: number) {
    const items = campagneListesRepo
      .all()
      .filter((cl) => !(cl.campagne_id === campagneId && cl.liste_id === listeId))
    write(KEYS.campagneListes, items)
  },

  listesOf: (campagneId: number): ListeContact[] => {
    const links = campagneListesRepo.all().filter((cl) => cl.campagne_id === campagneId)
    const ids = new Set(links.map((l) => l.liste_id))
    return listesRepo.all().filter((l) => ids.has(l.id))
  },

  contactsOf: (campagneId: number): Contact[] => {
    const listes = campagnesRepo.listesOf(campagneId)
    const allContacts: Contact[] = []
    const seen = new Set<number>()
    for (const l of listes) {
      for (const c of listesRepo.contactsOf(l.id)) {
        if (!seen.has(c.id)) {
          seen.add(c.id)
          allContacts.push(c)
        }
      }
    }
    return allContacts
  },
}

// ============================================================
// REPOS — Liens campagne-liste
// ============================================================

export const campagneListesRepo = {
  all: () => read<CampagneListe[]>(KEYS.campagneListes, []),
  byCampagne: (campagneId: number) =>
    campagneListesRepo.all().filter((cl) => cl.campagne_id === campagneId),
}

// ============================================================
// REPOS — Commentaires
// ============================================================

export const commentairesRepo = {
  all: () => read<Commentaire[]>(KEYS.commentaires, []),
  byCampagne: (campagneId: number) =>
    commentairesRepo.all().filter((c) => c.campagne_id === campagneId),
  create(data: Omit<Commentaire, 'id' | 'date_creation'>): Commentaire {
    const items = commentairesRepo.all()
    const item: Commentaire = {
      ...data,
      id: nextId('commentaires'),
      date_creation: new Date().toISOString(),
    }
    items.push(item)
    write(KEYS.commentaires, items)
    return item
  },
  remove(id: number) {
    const items = commentairesRepo.all().filter((c) => c.id !== id)
    write(KEYS.commentaires, items)
  },
}

// ============================================================
// HELPERS — Contacts ↔ Listes
// ============================================================

export function listesOfContact(contactId: number): ListeContact[] {
  const links = listeContactsRepo.all().filter((lc) => lc.contact_id === contactId)
  const ids = new Set(links.map((l) => l.liste_id))
  return listesRepo.all().filter((l) => ids.has(l.id))
}

export function setContactListes(contactId: number, listeIds: number[]) {
  const all = listeContactsRepo.all().filter((lc) => lc.contact_id !== contactId)
  const now = new Date().toISOString()
  for (const listeId of listeIds) {
    all.push({
      id: nextId('liste_contacts'),
      liste_id: listeId,
      contact_id: contactId,
      date_ajout: now,
    })
  }
  write(KEYS.listeContacts, all)
}

// ============================================================
// SESSION
// ============================================================

export interface Session {
  user_id: number
  created_at: string
}

export const sessionRepo = {
  get(): Session | null {
    return read<Session | null>(KEYS.session, null)
  },
  set(userId: number) {
    write(KEYS.session, { user_id: userId, created_at: new Date().toISOString() })
  },
  clear() {
    if (!isBrowser()) return
    window.localStorage.removeItem(KEYS.session)
  },
  currentUser(): User | null {
    const s = sessionRepo.get()
    if (!s) return null
    return usersRepo.byId(s.user_id)
  },
}

// ============================================================
// AUTH
// ============================================================

export interface AuthResult {
  ok: boolean
  error?: string
  user?: User
}

export function registerUser(data: {
  prenom: string
  nom: string
  email: string
  password: string
}): AuthResult {
  initStorage()
  const email = data.email.trim().toLowerCase()

  if (!email || !data.password) return { ok: false, error: 'E-mail et mot de passe requis.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Adresse e-mail invalide.' }
  if (email === SUPER_ADMIN_EMAIL) return { ok: false, error: 'Cet e-mail est réservé à l’administrateur.' }
  if (data.password.length < 8) return { ok: false, error: 'Le mot de passe doit contenir au moins 8 caractères.' }
  if (usersRepo.byEmail(email)) return { ok: false, error: 'Un compte existe déjà avec cet e-mail.' }

  const user = usersRepo.create({
    prenom: data.prenom.trim() || 'Nouveau',
    nom: data.nom.trim() || 'Membre',
    email,
    password: data.password,
    role_id: 3,
    permissions: [...DEFAULT_MEMBER_PERMISSIONS],
  })
  sessionRepo.set(user.id)
  return { ok: true, user }
}

export function loginUser(data: { email: string; password: string }): AuthResult {
  initStorage()
  const email = data.email.trim().toLowerCase()
  const user = usersRepo.byEmail(email)
  if (!user) return { ok: false, error: 'Aucun compte trouvé avec cet e-mail.' }
  if (user.password !== data.password) return { ok: false, error: 'Mot de passe incorrect.' }
  usersRepo.touchLogin(user.id)
  sessionRepo.set(user.id)
  return { ok: true, user: usersRepo.byId(user.id) ?? user }
}

export function logoutUser() {
  sessionRepo.clear()
}

export function resetStorage() {
  if (!isBrowser()) return
  Object.values(KEYS).forEach((k) => window.localStorage.removeItem(k))
}

// ============================================================
// IMPORT CSV
// ============================================================

export const CONTACT_IMPORT_COLUMNS = [
  'nom',
  'prenom',
  'reseau_social',
  'telephone',
  'mobile',
  'address',
  'code_postal',
  'ville',
  'email',
  'profile',
  'commentaire',
] as const

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r/g, '')
  const lines = clean.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }

  const detectSep = (line: string) => {
    const comma = (line.match(/,/g) || []).length
    const semi = (line.match(/;/g) || []).length
    return semi > comma ? ';' : ','
  }
  const sep = detectSep(lines[0])

  const splitLine = (line: string) => {
    const result: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === sep && !inQuotes) {
        result.push(cur)
        cur = ''
      } else {
        cur += ch
      }
    }
    result.push(cur)
    return result.map((v) => v.trim())
  }

  const headers = splitLine(lines[0]).map((h) => h.replace(/^"|"$/g, ''))
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i])
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ?? ''
    })
    rows.push(obj)
  }
  return { headers, rows }
}

export type { ViewKey } from './permissions'