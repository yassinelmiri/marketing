import { ADMIN_ROLE_ID, type User } from '@/lib/storage'

type SearchableAdminUser = Pick<User, 'prenom' | 'nom' | 'email' | 'telephone' | 'role_id'>

export function filterAdminUsers<T extends SearchableAdminUser>(
  users: readonly T[],
  search: string,
  roleFilter: string,
): T[] {
  const query = search.trim().toLocaleLowerCase('fr')
  return users.filter((user) => {
    const matchesSearch = !query
      || `${user.prenom} ${user.nom} ${user.email} ${user.telephone ?? ''}`.toLocaleLowerCase('fr').includes(query)
    const matchesRole = roleFilter === 'all' || String(user.role_id) === roleFilter
    return matchesSearch && matchesRole
  })
}

export function countAdminUsers(users: readonly Pick<User, 'role_id'>[]): number {
  return users.reduce((count, user) => count + (user.role_id === ADMIN_ROLE_ID ? 1 : 0), 0)
}
