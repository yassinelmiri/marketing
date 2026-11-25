export const IMPORT_FIELD_OPTIONS = [
  { value: 'nom', label: 'Nom' },
  { value: 'prenom', label: 'Prénom' },
  { value: 'reseau_social', label: 'Raison sociale / Segment' },
  { value: 'telephone', label: 'Téléphone' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'address', label: 'Adresse' },
  { value: 'code_postal', label: 'Code postal' },
  { value: 'ville', label: 'Ville' },
  { value: 'email', label: 'E-mail' },
  { value: 'profile', label: 'Profil / URL' },
  { value: 'commentaire', label: 'Commentaire' },
] as const

export function buildImportMapping(headers: string[]): Record<string, string> {
  const aliases: Record<string, string[]> = {
    nom: ['nom', 'name', 'lastname', 'last name', 'nom de famille'],
    prenom: ['prenom', 'prénom', 'firstname', 'first name'],
    reseau_social: ['raison sociale', 'raison_sociale', 'societe', 'société', 'segment', 'reseau social'],
    telephone: ['telephone', 'téléphone', 'phone', 'tel'],
    mobile: ['mobile', 'portable', 'cellulaire'],
    address: ['adresse', 'address', 'rue'],
    code_postal: ['code postal', 'code_postal', 'postal code', 'zip'],
    ville: ['ville', 'city', 'localite', 'localité'],
    email: ['email', 'e-mail', 'mail', 'courriel'],
    profile: ['profil', 'profile', 'url', 'linkedin'],
    commentaire: ['commentaire', 'comment', 'note', 'notes'],
  }
  const normalize = (value: string) => value.trim().toLocaleLowerCase('fr').normalize('NFD').replace(/\p{M}/gu, '').replace(/[_-]/g, ' ')
  const used = new Set<string>()
  return Object.fromEntries(headers.map((header) => {
    const match = IMPORT_FIELD_OPTIONS.find((option) => aliases[option.value]?.some((alias) => normalize(alias) === normalize(header)) && !used.has(option.value))
    if (match) used.add(match.value)
    return [header, match?.value ?? '']
  }))
}
