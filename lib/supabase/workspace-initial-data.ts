import 'server-only'
import type { MarketingData } from '@/lib/supabase/marketing-data'
import { createClient } from '@/lib/supabase/server'

/** User-scoped initial data fetched on the server for the workspace route. */
export async function loadWorkspaceInitialData(): Promise<MarketingData | null> {
  const supabase = await createClient()
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) return null

  const [campaigns, comments, lists, campaignLists, types] = await Promise.all([
    supabase.from('campagnes').select('id,type_campagne_id,user_id,titre,cible,note,status,date_creation,date_modification').order('date_modification', { ascending: false }).limit(500),
    supabase.from('commentaires').select('id,campagne_id,user_id,contenu,date_creation').order('date_creation', { ascending: true }).limit(1000),
    supabase.from('listes').select('id,nom,description,cible,note,ajoute_par_nom,date_creation,date_modification,created_by').order('date_creation', { ascending: false }).limit(500),
    supabase.from('campagne_listes').select('id,campagne_id,liste_id,date_ajout').limit(2000),
    supabase.from('type_campagnes').select('id,nom,code,description,icone,actif,date_creation,created_by').eq('actif', true).order('nom'),
  ])
  const error = campaigns.error || comments.error || lists.error || campaignLists.error || types.error
  if (error) {
    console.error('[workspace] server bootstrap failed:', error.message)
    return null
  }

  return {
    campagnes: (campaigns.data ?? []).map((row) => ({
      ...row, id: Number(row.id), type_campagne_id: Number(row.type_campagne_id ?? 0),
      user_id: Number(row.user_id ?? 0), cible: row.cible ?? '', note: row.note ?? '',
      status: row.status as MarketingData['campagnes'][number]['status'],
    })),
    commentaires: (comments.data ?? []).map((row) => ({ ...row, id: Number(row.id), campagne_id: Number(row.campagne_id), user_id: Number(row.user_id ?? 0) })),
    listes: (lists.data ?? []).map((row) => ({
      ...row, id: Number(row.id), description: row.description ?? '', cible: row.cible ?? '',
      note: row.note ?? '', ajoute_par_nom: row.ajoute_par_nom ?? '', created_by: Number(row.created_by ?? 0),
    })),
    contacts: [],
    campagneListes: (campaignLists.data ?? []).map((row) => ({ ...row, id: Number(row.id), campagne_id: Number(row.campagne_id), liste_id: Number(row.liste_id) })),
    listeContacts: [],
    typesCampagnes: (types.data ?? []).map((row) => ({ ...row, id: Number(row.id), description: row.description ?? '', icone: row.icone ?? '', created_by: Number(row.created_by ?? 0) })),
  }
}
