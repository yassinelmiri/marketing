// lib/permissions.ts

/**
 * Pages accessibles dans le workspace.
 * Ces clés doivent correspondre aux `key` de NAV_ITEMS dans marketing-workspace.tsx.
 */
export type ViewKey =
  | 'dashboard'
  | 'campagnes'
  | 'prospection'
  | 'listes'
  | 'equipe'
  | 'tasks'
  | 'whatsapp'
  | 'email'
  | 'sms'
  | 'admin-users'
  | 'settings'

/**
 * Pages accordables par un administrateur à un membre.
 * (le dashboard est toujours accessible, donc pas besoin de l'accorder)
 */
export const GRANTABLE_PAGES: Array<{ key: ViewKey; label: string }> = [
  { key: 'dashboard', label: 'Tableau de bord' },
  { key: 'campagnes', label: 'Campagnes' },
  { key: 'prospection', label: 'Prospection' },
  { key: 'listes', label: 'Listes & contacts' },
  { key: 'equipe', label: 'Équipe' },
  { key: 'whatsapp', label: 'Campagnes WhatsApp' },
  { key: 'email', label: 'E-mail' },
  { key: 'sms', label: 'SMS' },
  { key: 'admin-users', label: 'Utilisateurs' },
  { key: 'settings', label: 'Paramètres' },
]

/** Permissions par défaut d'un nouveau membre. */
export const DEFAULT_MEMBER_PERMISSIONS: ViewKey[] = ['dashboard', 'prospection']

/** Nettoie un tableau de permissions (retire les doublons et les valeurs invalides). */
export function sanitizePermissions(input: unknown): ViewKey[] {
  if (!Array.isArray(input)) return [...DEFAULT_MEMBER_PERMISSIONS]
  const allowed = new Set<ViewKey>(GRANTABLE_PAGES.map((p) => p.key))
  const result: ViewKey[] = []
  for (const item of input) {
    if (typeof item === 'string' && allowed.has(item as ViewKey) && !result.includes(item as ViewKey)) {
      result.push(item as ViewKey)
    }
  }
  // Le dashboard est toujours présent
  if (!result.includes('dashboard')) result.unshift('dashboard')
  return result
}

/** Vérifie si une valeur est une ViewKey valide. */
export function isViewKey(value: string): value is ViewKey {
  return GRANTABLE_PAGES.some((p) => p.key === value)
}