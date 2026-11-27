import type { CampagneListe, Campagne, ListeContact } from '@/lib/storage'

/** Indexes the names of lists attached to each campaign for fast local search. */
export function buildCampaignListNameIndex(
  links: CampagneListe[],
  listes: Pick<ListeContact, 'id' | 'nom'>[],
): Map<number, string> {
  const listNameById = new Map(listes.map((list) => [list.id, list.nom]))
  const namesByCampaignId = new Map<number, string[]>()

  for (const link of links) {
    const listName = listNameById.get(link.liste_id)
    if (!listName) continue
    const names = namesByCampaignId.get(link.campagne_id) ?? []
    names.push(listName)
    namesByCampaignId.set(link.campagne_id, names)
  }

  return new Map([...namesByCampaignId].map(([id, names]) => [id, names.join(' ')]))
}

/** Returns the campaigns a member can access without changing the source array. */
export function getCampaignsVisibleToUser(
  campaigns: Campagne[],
  assignments: { campagne_id: number; user_id: number }[],
  userId: number,
  isAdmin: boolean,
): Campagne[] {
  if (isAdmin) return campaigns
  const assignedIds = new Set(
    assignments.filter((assignment) => assignment.user_id === userId)
      .map((assignment) => assignment.campagne_id),
  )
  return campaigns.filter((campaign) => assignedIds.has(campaign.id))
}
