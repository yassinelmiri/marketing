// lib/xlsx.ts
import * as XLSX from 'xlsx'

/**
 * Lit un fichier .xlsx / .xls et retourne un tableau d'objets
 * en convertissant les en-têtes en chaînes.
 */
export async function readXlsxFile(file: File): Promise<Record<string, string>[]> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  return json.map((row) => {
    const obj: Record<string, string> = {}
    Object.entries(row).forEach(([k, v]) => {
      obj[String(k).trim()] = v == null ? '' : String(v)
    })
    return obj
  })
}