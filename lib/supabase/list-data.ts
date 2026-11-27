import type { ListeContact } from '@/lib/storage'
import { createClient } from '@/lib/supabase/client'

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
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
