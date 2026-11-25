import type { Contact } from '@/lib/storage'
import { createClient } from '@/lib/supabase/client'

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
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
