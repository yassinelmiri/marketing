import { parseCsv } from '@/lib/storage'

export interface ParsedContactImport {
  headers: string[]
  rows: Record<string, string>[]
}

/** Parse supported contact-import files without coupling parsing to the UI. */
export async function parseContactImportFile(file: File): Promise<ParsedContactImport> {
  const extension = file.name.toLowerCase().split('.').pop()

  if (extension === 'csv') {
    const { headers, rows } = parseCsv(await file.text())
    return { headers, rows }
  }

  if (extension === 'xlsx' || extension === 'xls') {
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) return { headers: [], rows: [] }

    const worksheet = workbook.Sheets[firstSheetName]
    const values = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' })
    const rows = values.map((row) => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [String(key).trim(), value == null ? '' : String(value)]),
    ))
    return { headers: Object.keys(rows[0] ?? {}), rows }
  }

  throw new Error('Choisissez un fichier .csv ou .xlsx.')
}
