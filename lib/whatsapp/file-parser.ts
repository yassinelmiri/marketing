import { findColumn, NAME_COLUMN_CANDIDATES, normalizePhone, PHONE_COLUMN_CANDIDATES } from '@/lib/whatsapp/contact-import'

export type WhatsAppContactStatus = 'pending' | 'opened' | 'sent' | 'failed' | 'skipped'
export type WhatsAppImportContact = { id: string; name: string; phone: string; status: WhatsAppContactStatus }

export interface WhatsAppImportResult {
  contacts: WhatsAppImportContact[]
  duplicates: number
  invalid: number
}

/** Read a CSV/XLS/XLSX file and normalize unique WhatsApp phone numbers. */
export async function parseWhatsAppImportFile(file: File): Promise<WhatsAppImportResult> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!['xlsx', 'xls', 'csv'].includes(extension ?? '')) {
    throw new Error('Choisissez un fichier XLSX, XLS ou CSV.')
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Le fichier dépasse 15 Mo.')
  }

  const XLSX = await import('xlsx')
  const source = extension === 'csv' ? await file.text() : await file.arrayBuffer()
  const workbook = XLSX.read(source, { type: extension === 'csv' ? 'string' : 'array', raw: false })
  const firstSheetName = workbook.SheetNames[0]
  const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined
  if (!firstSheet) throw new Error('Le fichier ne contient aucune feuille lisible.')

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '', raw: false })
  if (!rows.length) throw new Error('Aucun contact trouvé dans le fichier.')

  const headers = Object.keys(rows[0])
  const phoneColumn = findColumn(headers, PHONE_COLUMN_CANDIDATES) ?? headers[0]
  const nameColumn = findColumn(headers, NAME_COLUMN_CANDIDATES)
  const seen = new Set<string>()
  const contacts: WhatsAppImportContact[] = []
  let duplicates = 0
  let invalid = 0

  rows.forEach((row, index) => {
    const phone = normalizePhone(row[phoneColumn])
    if (!phone) {
      if (String(row[phoneColumn] ?? '').trim()) invalid += 1
      return
    }
    if (seen.has(phone)) {
      duplicates += 1
      return
    }
    seen.add(phone)
    contacts.push({
      id: String(index) + '-' + phone,
      name: nameColumn ? String(row[nameColumn] ?? '').trim() : '',
      phone,
      status: 'pending',
    })
  })

  if (!contacts.length) {
    throw new Error('Aucun numéro valide trouvé dans la colonne « ' + phoneColumn + ' ».')
  }

  return { contacts, duplicates, invalid }
}
