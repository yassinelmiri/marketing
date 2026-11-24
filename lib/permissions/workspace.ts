import { GRANTABLE_PAGES, type ViewKey } from '../permissions'

type PermissionLink = { permission_id: number | string }
type UserPermissionLink = PermissionLink & { granted: boolean }
type PermissionRecord = { id: number | string; code: string }

const PERMISSION_TO_PAGE: Record<string, ViewKey> = {
  'campagne.read': 'campagnes',
  'listes.read': 'listes',
  'equipe.read': 'equipe',
  'whatsapp.access': 'whatsapp',
  'email.access': 'email',
  'sms.access': 'sms',
}

/** Resolve les pages accessibles depuis les permissions du rôle et les dérogations utilisateur. */
export function resolveWorkspacePermissions(
  roleId: number,
  roleLinks: PermissionLink[] = [],
  userLinks: UserPermissionLink[] = [],
  permissions: PermissionRecord[] = [],
): ViewKey[] {
  const isAdmin = roleId === 1
  const inheritedIds = new Set(roleLinks.map(({ permission_id }) => Number(permission_id)))
  const overrides = new Map(userLinks.map(({ permission_id, granted }) => [Number(permission_id), granted]))

  const pagePermissions = new Set<ViewKey>(
    isAdmin ? GRANTABLE_PAGES.map(({ key }) => key) : ['dashboard'],
  )

  if (!isAdmin) {
    for (const permission of permissions) {
      const id = Number(permission.id)
      const granted = overrides.has(id) ? overrides.get(id) : inheritedIds.has(id)
      const page = PERMISSION_TO_PAGE[permission.code]
      if (granted && page) pagePermissions.add(page)
    }
  }

  pagePermissions.add('dashboard')
  pagePermissions.add('settings')
  pagePermissions.add('tasks')

  return [...pagePermissions]
}
