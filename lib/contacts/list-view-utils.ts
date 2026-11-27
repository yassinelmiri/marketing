import type { CampagneListe, ListeContact, User } from '@/lib/storage'

type VisibleListesOptions = {
  listes: ListeContact[]
  campagneListes: CampagneListe[]
  campagneMembres: { id: number; campagne_id: number; user_id: number }[]
  user: Pick<User, 'id' | 'role_id'>
  search: string
  dateFilter: 'all' | 'today' | '7d' | '30d'
  sort: 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc'
  now?: Date
}

/** Applies workspace access, search, date and sorting rules without mutating source lists. */
export function getVisibleListes({
  listes,
  campagneListes,
  campagneMembres,
  user,
  search,
  dateFilter,
  sort,
  now = new Date(),
}: VisibleListesOptions): ListeContact[] {
  const query = search.trim().toLocaleLowerCase('fr')
  const assignedCampaignIds = new Set(campagneMembres
    .filter((assignment) => assignment.user_id === user.id)
    .map((assignment) => assignment.campagne_id))
  const assignedListeIds = new Set(campagneListes
    .filter((link) => assignedCampaignIds.has(link.campagne_id))
    .map((link) => link.liste_id))
  const availableLists = Number(user.role_id) === 1
    ? listes
    : listes.filter((liste) => liste.created_by === user.id || assignedListeIds.has(liste.id))

  return availableLists.filter((liste) => {
    const matchesText = !query || [liste.nom, liste.description, liste.cible]
      .some((value) => (value ?? '').toLocaleLowerCase('fr').includes(query))
    if (!matchesText) return false
    if (dateFilter === 'all') return true
    const createdAt = new Date(liste.date_creation)
    if (Number.isNaN(createdAt.getTime())) return false
    const start = new Date(now)
    if (dateFilter === 'today') start.setHours(0, 0, 0, 0)
    if (dateFilter === '7d') start.setDate(start.getDate() - 7)
    if (dateFilter === '30d') start.setDate(start.getDate() - 30)
    return createdAt >= start
  }).sort((a, b) => {
    if (sort === 'name-asc') return a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' })
    if (sort === 'name-desc') return b.nom.localeCompare(a.nom, 'fr', { sensitivity: 'base' })
    const delta = new Date(a.date_creation).getTime() - new Date(b.date_creation).getTime()
    return sort === 'date-asc' ? delta : -delta
  })
}
