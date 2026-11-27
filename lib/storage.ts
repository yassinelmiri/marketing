// Types métier partagés et utilitaires d'import.
// La persistance et l'authentification sont exclusivement gérées par Supabase.
// Aucun accès à localStorage, aucune session locale et aucun mot de passe ici.

import type { ViewKey } from './permissions'

export interface User {
  id: number
  prenom: string
  nom: string
  email: string
  telephone: string
  address: string
  role_id: number
  date_creation: string
  date_dernier_login: string | null
  ip_address: string | null
  permissions: ViewKey[]
}

export interface Role {
  id: number
  nom: string
  description: string
}

export interface Permission {
  id: number
  nom: string
  code: string
  description: string
}

export interface RolePermission {
  id: number
  role_id: number
  permission_id: number
}

export interface ListeContact {
  id: number
  nom: string
  description: string
  cible: string
  note: string
  ajoute_par_nom: string
  date_creation: string
  date_modification: string
  created_by: number
}

export interface Contact {
  id: number
  nom: string
  prenom: string
  reseau_social: string
  telephone: string
  mobile: string
  address: string
  code_postal: string
  ville: string
  pays?: string | null
  age?: number | null
  email: string
  profile: string
  date_creation: string
  date_modification: string
  created_by: number
  commentaire: string
}

export interface ListeContactContact {
  id: number
  liste_id: number
  contact_id: number
  date_ajout: string
}

export type CampagneStatus = 'brouillon' | 'en_cours' | 'terminee' | 'archivee'

export const CAMPAGNE_STATUS_LABELS: Record<CampagneStatus, string> = {
  brouillon: 'Brouillon',
  en_cours: 'En cours',
  terminee: 'Terminée',
  archivee: 'Archivée',
}

export interface TypeCampagne {
  id: number
  nom: string
  code: string
  description: string
  icone: string
  actif: boolean
  date_creation: string
  created_by: number
}

export interface Campagne {
  id: number
  type_campagne_id: number
  user_id: number
  titre: string
  cible: string
  note: string
  status: CampagneStatus
  date_creation: string
  date_modification: string
}

export interface CampagneListe {
  id: number
  campagne_id: number
  liste_id: number
  date_ajout: string
}

export interface Commentaire {
  id: number
  campagne_id: number
  user_id: number
  contenu: string
  date_creation: string
}

export const SUPER_ADMIN_EMAIL = 'miriyassine123@gmail.com'
export const ADMIN_ROLE_ID = 1

export const CONTACT_IMPORT_COLUMNS = [
  'nom',
  'prenom',
  'raison_sociale',
  'telephone',
  'mobile',
  'address',
  'code_postal',
  'ville',
  'email',
  'profile',
  'commentaire',
] as const

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r/g, '')
  const lines = clean.split('\n').filter((line) => line.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }

  const detectSeparator = (line: string) => {
    const commas = (line.match(/,/g) ?? []).length
    const semicolons = (line.match(/;/g) ?? []).length
    return semicolons > commas ? ';' : ','
  }
  const separator = detectSeparator(lines[0])

  const splitLine = (line: string) => {
    const values: string[] = []
    let current = ''
    let quoted = false

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]
      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"'
          index += 1
        } else {
          quoted = !quoted
        }
      } else if (character === separator && !quoted) {
        values.push(current)
        current = ''
      } else {
        current += character
      }
    }

    values.push(current)
    return values.map((value) => value.trim().replace(/^"|"$/g, ''))
  }

  const headers = splitLine(lines[0])
  const rows: Record<string, string>[] = []

  for (let index = 1; index < lines.length; index += 1) {
    const cells = splitLine(lines[index])
    const row: Record<string, string> = {}
    headers.forEach((header, cellIndex) => {
      row[header] = cells[cellIndex] ?? ''
    })
    rows.push(row)
  }

  return { headers, rows }
}

export type { ViewKey }
