import type {
  Campagne,
  CampagneListe,
  Commentaire,
  ListeContact,
  TypeCampagne,
} from '@/lib/storage'
import { createClient } from '@/lib/supabase/client'

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

export interface MarketingData {
  campagnes: Campagne[]
  commentaires: Commentaire[]
  listes: ListeContact[]
  campagneListes: CampagneListe[]
  typesCampagnes: TypeCampagne[]
  campagneMembres: { id: number; campagne_id: number; user_id: number }[]
}

export async function loadMarketingData(): Promise<MarketingData> {
  const supabase = createClient()

  const [
    campagnesResult,
    commentairesResult,
    listesResult,
    campagneListesResult,
    typesResult,
    campagneMembresResult,
  ] = await Promise.all([
    supabase.from('campagnes').select('id, type_campagne_id, user_id, titre, cible, note, status, date_creation, date_modification').order('date_modification', { ascending: false }),
    supabase.from('commentaires').select('id, campagne_id, user_id, contenu, date_creation').order('date_creation', { ascending: true }),
    supabase.from('listes').select('id, nom, description, cible, note, ajoute_par_nom, date_creation, date_modification, created_by').order('date_creation', { ascending: false }),
    supabase.from('campagne_listes').select('id, campagne_id, liste_id, date_ajout'),
    supabase.from('type_campagnes').select('id, nom, code, description, icone, actif, date_creation, created_by').eq('actif', true).order('nom'),
    supabase.from('campagne_membres').select('id, campagne_id, user_id'),
  ])

  const errors = [
    campagnesResult.error,
    commentairesResult.error,
    listesResult.error,
    campagneListesResult.error,
    typesResult.error,
    campagneMembresResult.error,
  ]
  const firstError = errors.find(Boolean)
  throwIfError(firstError ?? null)

  return {
    campagnes: (campagnesResult.data ?? []).map((row) => ({
      ...row,
      id: Number(row.id),
      type_campagne_id: Number(row.type_campagne_id ?? 0),
      user_id: Number(row.user_id ?? 0),
      cible: row.cible ?? '',
      note: row.note ?? '',
      status: row.status as Campagne['status'],
    })),
    commentaires: (commentairesResult.data ?? []).map((row) => ({
      ...row,
      id: Number(row.id),
      campagne_id: Number(row.campagne_id),
      user_id: Number(row.user_id ?? 0),
    })),
    listes: (listesResult.data ?? []).map((row) => ({
      ...row,
      id: Number(row.id),
      description: row.description ?? '',
      cible: row.cible ?? '',
      note: row.note ?? '',
      ajoute_par_nom: row.ajoute_par_nom ?? '',
      created_by: Number(row.created_by ?? 0),
    })),
    campagneListes: (campagneListesResult.data ?? []).map((row) => ({
      ...row,
      id: Number(row.id),
      campagne_id: Number(row.campagne_id),
      liste_id: Number(row.liste_id),
    })),
    campagneMembres: (campagneMembresResult.data ?? []).map((row) => ({ id: Number(row.id), campagne_id: Number(row.campagne_id), user_id: Number(row.user_id) })),
    typesCampagnes: (typesResult.data ?? []).map((row) => ({
      ...row,
      id: Number(row.id),
      description: row.description ?? '',
      icone: row.icone ?? '',
      created_by: Number(row.created_by ?? 0),
    })),
  }
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

export async function createListe(
  input: Pick<ListeContact, 'nom' | 'description' | 'cible' | 'note' | 'ajoute_par_nom'> & { created_by: number },
): Promise<ListeContact> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('listes')
    .insert({
      ...input,
      description: input.description || null,
      cible: input.cible || null,
      note: input.note || null,
      ajoute_par_nom: input.ajoute_par_nom || null,
    })
    .select('id, nom, description, cible, note, ajoute_par_nom, date_creation, date_modification, created_by')
    .single()
  throwIfError(error)
  if (!data) throw new Error('La liste créée n’a pas été retournée.')
  return {
    ...data,
    id: Number(data.id),
    description: data.description ?? '',
    cible: data.cible ?? '',
    note: data.note ?? '',
    ajoute_par_nom: data.ajoute_par_nom ?? '',
    created_by: Number(data.created_by ?? 0),
  }
}

export async function createContact(
  input: Omit<Contact, 'id' | 'date_creation' | 'date_modification'>,
): Promise<Contact> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      ...input,
      nom: input.nom || null,
      prenom: input.prenom || null,
      reseau_social: input.reseau_social || null,
      telephone: input.telephone || null,
      mobile: input.mobile || null,
      address: input.address || null,
      code_postal: input.code_postal || null,
      ville: input.ville || null,
      email: input.email || null,
      profile: input.profile || null,
      commentaire: input.commentaire || null,
    })
    .select('id, nom, prenom, reseau_social, telephone, mobile, address, code_postal, ville, email, profile, date_creation, date_modification, created_by, commentaire')
    .single()
  throwIfError(error)
  if (!data) throw new Error('Le contact créé n’a pas été retourné.')
  return {
    ...data,
    id: Number(data.id),
    nom: data.nom ?? '',
    prenom: data.prenom ?? '',
    reseau_social: data.reseau_social ?? '',
    telephone: data.telephone ?? '',
    mobile: data.mobile ?? '',
    address: data.address ?? '',
    code_postal: data.code_postal ?? '',
    ville: data.ville ?? '',
    email: data.email ?? '',
    profile: data.profile ?? '',
    created_by: Number(data.created_by ?? 0),
    commentaire: data.commentaire ?? '',
  }
}

export async function setContactListes(contactId: number, listeIds: number[]): Promise<void> {
  const supabase = createClient()
  const { error: deleteError } = await supabase
    .from('liste_contacts')
    .delete()
    .eq('contact_id', contactId)
  throwIfError(deleteError)

  if (listeIds.length === 0) return
  const { error } = await supabase.from('liste_contacts').insert(
    [...new Set(listeIds)].map((liste_id) => ({ liste_id, contact_id: contactId })),
  )
  throwIfError(error)
}

export async function updateListe(
  id: number,
  patch: Partial<Pick<ListeContact, 'nom' | 'description' | 'cible' | 'note' | 'ajoute_par_nom'>>,
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('listes')
    .update({
      ...patch,
      description: patch.description || null,
      cible: patch.cible || null,
      note: patch.note || null,
      ajoute_par_nom: patch.ajoute_par_nom || null,
      date_modification: new Date().toISOString(),
    })
    .eq('id', id)
  throwIfError(error)
}

export async function deleteListe(id: number): Promise<void> {
  const supabase = createClient()
  const { error: contactLinksError } = await supabase.from('liste_contacts').delete().eq('liste_id', id)
  throwIfError(contactLinksError)
  const { error: campaignLinksError } = await supabase.from('campagne_listes').delete().eq('liste_id', id)
  throwIfError(campaignLinksError)
  const { error } = await supabase.from('listes').delete().eq('id', id)
  throwIfError(error)
}

export async function updateContact(
  id: number,
  patch: Partial<Omit<Contact, 'id' | 'date_creation' | 'date_modification'>>,
): Promise<void> {
  const supabase = createClient()
  const nullableFields = [
    'nom', 'prenom', 'reseau_social', 'telephone', 'mobile', 'address',
    'code_postal', 'ville', 'email', 'profile', 'commentaire',
  ] as const
  const values: Record<string, unknown> = { ...patch, date_modification: new Date().toISOString() }
  for (const field of nullableFields) {
    if (field in values && values[field] === '') values[field] = null
  }
  const { error } = await supabase.from('contacts').update(values).eq('id', id)
  throwIfError(error)
}

export async function deleteContact(id: number): Promise<void> {
  const supabase = createClient()
  const { error: linksError } = await supabase.from('liste_contacts').delete().eq('contact_id', id)
  throwIfError(linksError)
  const { error } = await supabase.from('contacts').delete().eq('id', id)
  throwIfError(error)
}

export async function importContactsToListe(
  listeId: number,
  userId: number,
  rows: Record<string, string>[],
): Promise<{ created: number; errors: string[] }> {
  const supabase = createClient()
  const errors: string[] = []
  let created = 0

  for (const [index, row] of rows.entries()) {
    const nom = (row.nom ?? row.Nom ?? '').trim()
    const email = (row.email ?? row.Email ?? '').trim()
    if (!nom && !email) {
      errors.push(`Ligne ${index + 1}: nom ou e-mail obligatoire.`)
      continue
    }

    const value = (key: string) => (row[key] ?? '').trim()
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        nom: nom || null,
        prenom: value('prenom') || null,
        reseau_social: value('raison_sociale') || value('reseau_social') || null,
        telephone: value('telephone') || null,
        mobile: value('mobile') || null,
        address: value('address') || null,
        code_postal: value('code_postal') || null,
        ville: value('ville') || null,
        email: email || null,
        profile: value('profile') || null,
        commentaire: value('commentaire') || null,
        created_by: userId,
      })
      .select('id')
      .single()

    if (error || !data) {
      errors.push(`Ligne ${index + 1}: ${error?.message ?? 'contact non créé'}`)
      continue
    }

    const { error: linkError } = await supabase
      .from('liste_contacts')
      .insert({ liste_id: listeId, contact_id: Number(data.id) })

    if (linkError) {
      await supabase.from('contacts').delete().eq('id', data.id)
      errors.push(`Ligne ${index + 1}: ${linkError.message}`)
      continue
    }
    created += 1
  }

  return { created, errors }
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
