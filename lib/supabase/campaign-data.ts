import type { Campagne, Commentaire } from '@/lib/storage'
import { createClient } from '@/lib/supabase/client'

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

export async function createCampagne(
  input: Omit<Campagne, 'id' | 'date_creation' | 'date_modification'>,
): Promise<Campagne> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('campagnes')
    .insert({
      type_campagne_id: input.type_campagne_id,
      user_id: input.user_id,
      titre: input.titre,
      cible: input.cible || null,
      note: input.note || null,
      status: input.status,
    })
    .select('id, type_campagne_id, user_id, titre, cible, note, status, date_creation, date_modification')
    .single()

  throwIfError(error)
  if (!data) throw new Error('La campagne créée n’a pas été retournée.')
  return {
    ...data,
    id: Number(data.id),
    type_campagne_id: Number(data.type_campagne_id ?? 0),
    user_id: Number(data.user_id ?? 0),
    cible: data.cible ?? '',
    note: data.note ?? '',
    status: data.status as Campagne['status'],
  }
}

export async function updateCampagne(
  id: number,
  patch: Partial<Pick<Campagne, 'type_campagne_id' | 'titre' | 'cible' | 'note' | 'status'>>,
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('campagnes')
    .update({ ...patch, date_modification: new Date().toISOString() })
    .eq('id', id)
  throwIfError(error)
}

export async function deleteCampagne(id: number): Promise<void> {
  const supabase = createClient()
  const { error: linksError } = await supabase.from('campagne_listes').delete().eq('campagne_id', id)
  throwIfError(linksError)
  const { error: commentsError } = await supabase.from('commentaires').delete().eq('campagne_id', id)
  throwIfError(commentsError)
  const { error } = await supabase.from('campagnes').delete().eq('id', id)
  throwIfError(error)
}

export async function setListeCampagnes(listeId: number, campagneIds: number[]): Promise<void> {
  const supabase = createClient()
  const uniqueCampaignIds = [...new Set(campagneIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
  const { data: existing, error: readError } = await supabase
    .from('campagne_listes')
    .select('id,campagne_id')
    .eq('liste_id', listeId)
  throwIfError(readError)

  const existingRows = existing ?? []
  const existingIds = new Set(existingRows.map((row) => Number(row.campagne_id)))
  const nextIds = new Set(uniqueCampaignIds)
  const toInsert = uniqueCampaignIds.filter((id) => !existingIds.has(id))
  const toDelete = existingRows.filter((row) => !nextIds.has(Number(row.campagne_id)))

  if (toInsert.length) {
    const { error } = await supabase.from('campagne_listes').insert(
      toInsert.map((campagne_id) => ({ campagne_id, liste_id: listeId })),
    )
    throwIfError(error)
  }
  if (toDelete.length) {
    const { error } = await supabase.from('campagne_listes').delete().in('id', toDelete.map((row) => row.id))
    throwIfError(error)
  }
}

export async function setCampagneListes(campagneId: number, listeIds: number[]): Promise<void> {
  const supabase = createClient()
  const uniqueListeIds = [...new Set(listeIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]


  const { error: deleteError } = await supabase
    .from('campagne_listes')
    .delete()
    .eq('campagne_id', campagneId)
  throwIfError(deleteError)

  if (uniqueListeIds.length === 0) return
  const { error } = await supabase.from('campagne_listes').insert(
    uniqueListeIds.map((liste_id) => ({ campagne_id: campagneId, liste_id })),
  )
  throwIfError(error)
}

export async function addCampagneComment(
  campagneId: number,
  userId: number,
  contenu: string,
): Promise<Commentaire> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('commentaires')
    .insert({ campagne_id: campagneId, user_id: userId, contenu })
    .select('id, campagne_id, user_id, contenu, date_creation')
    .single()
  throwIfError(error)
  if (!data) throw new Error('Le commentaire créé n’a pas été retourné.')
  return {
    ...data,
    id: Number(data.id),
    campagne_id: Number(data.campagne_id),
    user_id: Number(data.user_id ?? 0),
  }
}

export async function setCampagneMembres(campagneId: number, userIds: number[]): Promise<void> {
  const supabase = createClient()
  const { error: deleteError } = await supabase.from('campagne_membres').delete().eq('campagne_id', campagneId)
  throwIfError(deleteError)
  const uniqueIds = [...new Set(userIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
  if (!uniqueIds.length) return
  const { error } = await supabase.from('campagne_membres').insert(uniqueIds.map((user_id) => ({ campagne_id: campagneId, user_id })))
  throwIfError(error)
}
