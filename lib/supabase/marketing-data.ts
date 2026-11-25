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




export {
  createCampagne,
  updateCampagne,
  deleteCampagne,
  setListeCampagnes,
  setCampagneListes,
  addCampagneComment,
  setCampagneMembres,
} from './campaign-data'

export {
  createContact,
  setContactListes,
  updateContact,
  deleteContact,
  importContactsToListe,
} from './contact-data'


export {
  createListe,
  updateListe,
  deleteListe,
} from './list-data'
