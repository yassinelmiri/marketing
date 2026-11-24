export const PHONE_COLUMN_CANDIDATES = [
  'telephone', 'téléphone', 'tel', 'tél', 'phone', 'mobile', 'gsm',
  'whatsapp', 'numero', 'numéro', 'رقم', 'هاتف',
]

export const NAME_COLUMN_CANDIDATES = [
  'nom complet', 'fullname', 'full name', 'name', 'nom', 'contact',
  'prenom', 'prénom',
]

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z0-9\\u0600-\\u06ff]/g, '')
}

export function normalizePhone(value: unknown): string | null {
  if (value === null || value === undefined) return null

  const raw = String(value).trim()
  if (!raw || raw.toLowerCase() === 'nan' || /e\\+\\d+$/i.test(raw)) return null

  let digits = raw.replace(/\\D/g, '')
  if (!digits) return null

  if (digits.startsWith('00212')) digits = digits.slice(5)
  else if (digits.startsWith('212')) digits = digits.slice(3)

  if (digits.startsWith('0') && digits.length === 10) digits = digits.slice(1)
  if (digits.length === 9 && /^[567]/.test(digits)) return '212' + digits
  if (digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0')) return digits

  return null
}

export function findColumn(headers: string[], candidates: string[]): string | null {
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    key: normalizeHeader(header),
  }))

  for (const candidate of candidates) {
    const key = normalizeHeader(candidate)
    const match = normalizedHeaders.find(
      (header) => header.key === key || header.key.includes(key),
    )
    if (match) return match.original
  }

  return null
}
