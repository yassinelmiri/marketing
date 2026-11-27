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
  const assignedCampaignIds = new Set<number>()
  for (const assignment of campagneMembres) {
    if (assignment.user_id === user.id) assignedCampaignIds.add(assignment.campagne_id)
  }
  const assignedListeIds = new Set<number>()
  for (const link of campagneListes) {
    if (assignedCampaignIds.has(link.campagne_id)) assignedListeIds.add(link.liste_id)
  }
  const availableLists = Number(user.role_id) === 1
    ? listes
    : listes.filter((liste) => liste.created_by === user.id || assignedListeIds.has(liste.id))
  const dateStart = new Date(now)
  if (dateFilter === 'today') dateStart.setHours(0, 0, 0, 0)
  if (dateFilter === '7d') dateStart.setDate(dateStart.getDate() - 7)
  if (dateFilter === '30d') dateStart.setDate(dateStart.getDate() - 30)

  return availableLists.filter((liste) => {
    const matchesText = !query || [liste.nom, liste.description, liste.cible]
      .some((value) => (value ?? '').toLocaleLowerCase('fr').includes(query))
    if (!matchesText) return false
    if (dateFilter === 'all') return true
    const createdAt = new Date(liste.date_creation)
    return !Number.isNaN(createdAt.getTime()) && createdAt >= dateStart
  }).sort((a, b) => {
    if (sort === 'name-asc') return a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' })
    if (sort === 'name-desc') return b.nom.localeCompare(a.nom, 'fr', { sensitivity: 'base' })
    const delta = new Date(a.date_creation).getTime() - new Date(b.date_creation).getTime()
    return sort === 'date-asc' ? delta : -delta
  })
}

/** Builds the contact-to-list names index used by the contacts table. */
export function buildContactListNamesByContactId(
  contactLinks: { contact_id: number; liste_id: number }[],
  listes: Pick<ListeContact, 'id' | 'nom'>[],
): Map<number, string[]> {
  const listsById = new Map(listes.map((liste) => [liste.id, liste.nom]))
  const namesByContactId = new Map<number, string[]>()
  for (const link of contactLinks) {
    const listName = listsById.get(link.liste_id)
    if (!listName) continue
    const names = namesByContactId.get(link.contact_id) ?? []
    names.push(listName)
    namesByContactId.set(link.contact_id, names)
  }
  return namesByContactId
}
