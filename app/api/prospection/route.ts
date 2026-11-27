import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createDecipheriv } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type FieldFilter = { field: string; operator: string; value: string }
type ApiConfig = { base_url: string; auth_type: 'none' | 'bearer' | 'api_key'; auth_header: string; encrypted_secret: string | null }

async function authorize() {
  const supabase = await createClient()
  const { data: auth, error } = await supabase.auth.getUser()
  if (error || !auth.user) return { response: NextResponse.json({ error: 'Authentification requise.' }, { status: 401 }) }
  const { data: profile, error: profileError } = await supabase.from('user_profiles').select('id,prenom,nom').eq('auth_user_id', auth.user.id).maybeSingle()
  if (profileError || !profile) return { response: NextResponse.json({ error: 'Profil utilisateur introuvable.' }, { status: 403 }) }
  return { profile } as const
}

function decryptSecret(value: string) {
  const rawKey = process.env.PROSPECTION_CONFIG_ENCRYPTION_KEY
  if (!rawKey) throw new Error('La variable PROSPECTION_CONFIG_ENCRYPTION_KEY est absente.')
  const key = Buffer.from(rawKey, 'base64')
  if (key.length !== 32) throw new Error('La clé de chiffrement Prospection est invalide.')
  const [iv, tag, encrypted] = value.split('.')
  if (!iv || !tag || !encrypted) throw new Error('La clé API enregistrée est illisible.')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8')
}

async function getConfig(): Promise<ApiConfig> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('prospection_api_config').select('base_url,auth_type,auth_header,encrypted_secret').eq('id', true).maybeSingle()
  if (error) throw new Error('Configuration API inaccessible. Vérifiez la migration Prospection.')
  if (!data?.base_url) throw new Error('Configurez une URL API dans Paramètres → Connexion API — Prospection.')
  return data as ApiConfig
}

function apiHeaders(config: ApiConfig) {
  const headers = new Headers({ Accept: 'application/json' })
  if (config.encrypted_secret) {
    const secret = decryptSecret(config.encrypted_secret)
    if (config.auth_type === 'bearer') headers.set('Authorization', `Bearer ${secret}`)
    if (config.auth_type === 'api_key') headers.set(config.auth_header || 'x-api-key', secret)
  }
  return headers
}

function extractRecords(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  for (const key of ['data', 'results', 'items', 'records', 'contacts', 'users', 'leads']) {
    if (Array.isArray(payload[key])) return payload[key]
    if (payload[key] && typeof payload[key] === 'object') {
      const nested = extractRecords(payload[key])
      if (nested.length) return nested
    }
  }
  return []
}

function flatten(value: unknown, prefix = '', output: Record<string, string> = {}): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (prefix) output[prefix] = value == null ? '' : String(value)
    return output
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, path, output)
    else output[path] = child == null ? '' : Array.isArray(child) ? child.join(', ') : String(child)
  }
  return output
}

function compare(actual: string, operator: string, expected: string) {
  const a = actual.trim().toLocaleLowerCase()
  const b = expected.trim().toLocaleLowerCase()
  if (operator === 'contains') return a.includes(b)
  if (operator === 'starts_with') return a.startsWith(b)
  if (operator === 'gt' || operator === 'gte' || operator === 'lt' || operator === 'lte') {
    const left = Number(actual); const right = Number(expected)
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false
    if (operator === 'gt') return left > right
    if (operator === 'gte') return left >= right
    if (operator === 'lt') return left < right
    return left <= right
  }
  return a === b
}

export async function GET(request: NextRequest) {
  const auth = await authorize()
  if ('response' in auth) return auth.response
  try {
    const config = await getConfig()
    const endpoint = new URL(config.base_url)
    if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(endpoint.hostname)) {
      return NextResponse.json({ error: 'L’API doit utiliser HTTPS.' }, { status: 400 })
    }
    const params = request.nextUrl.searchParams
    const page = Math.max(1, Math.min(10000, Number(params.get('page') || 1)))
    const pageSize = Math.max(1, Math.min(100, Number(params.get('pageSize') || 25)))
    const paginationMode = params.get('pagination') || 'page'
    const filterMode = params.get('filterMode') || 'query'
    const filters = JSON.parse(params.get('filters') || '[]') as FieldFilter[]
    if (!Array.isArray(filters) || filters.length > 30 || filters.some(f => !f || typeof f.field !== 'string' || !/^[\w.$-]{1,120}$/.test(f.field) || typeof f.value !== 'string')) {
      return NextResponse.json({ error: 'Critères de recherche invalides.' }, { status: 400 })
    }
    // The external API receives the exact field names selected by the user.
    // Unknown API-specific filter syntax can be configured later through an adapter.
    for (const filter of filters) {
      if (!filter.value.trim() || filter.operator !== 'eq' || filterMode === 'none') continue
      const key = filterMode === 'filter' ? `filter[${filter.field}]` : filterMode === 'filters' ? `filters[${filter.field}]` : filter.field
      endpoint.searchParams.set(key, filter.value.trim().slice(0, 200))
    }
    if (paginationMode === 'page') {
      endpoint.searchParams.set('page', String(page))
      endpoint.searchParams.set('per_page', String(pageSize))
    } else if (paginationMode === 'pageSize') {
      endpoint.searchParams.set('page', String(page))
      endpoint.searchParams.set('pageSize', String(pageSize))
    } else if (paginationMode === 'offset') {
      endpoint.searchParams.set('limit', String(pageSize))
      endpoint.searchParams.set('offset', String((page - 1) * pageSize))
    }
    let upstream = await fetch(endpoint, { headers: apiHeaders(config), cache: 'no-store', signal: AbortSignal.timeout(20000) })
    let payload = await upstream.json().catch(() => null)
    // Some APIs reject unknown filter parameters. Retry without filters and filter
    // the returned records locally rather than making the connector unusable.
    if (!upstream.ok && filters.length) {
      const fallback = new URL(endpoint)
      for (const filter of filters) {
        fallback.searchParams.delete(filter.field)
        fallback.searchParams.delete(`filter[${filter.field}]`)
        fallback.searchParams.delete(`filters[${filter.field}]`)
      }
      upstream = await fetch(fallback, { headers: apiHeaders(config), cache: 'no-store', signal: AbortSignal.timeout(20000) })
      payload = await upstream.json().catch(() => null)
    }
    if (!upstream.ok) {
      return NextResponse.json({ error: upstream.status === 401 ? 'Authentification refusée par l’API. Vérifiez le token.' : `L’API externe a répondu ${upstream.status}.`, details: payload }, { status: 502 })
    }
    let records = extractRecords(payload)
    const rawCount = records.length
    // If the API does not implement filtering, apply the selected criteria locally
    // to the returned page, while clearly keeping the API pagination metadata.
    records = records.filter(record => filters.every(filter => !filter.value.trim() || compare(String(flatten(record)[filter.field] ?? ''), filter.operator || 'contains', filter.value)))
    const first = records[0] ? flatten(records[0]) : {}
    const fields = Array.from(new Set(records.flatMap(record => Object.keys(flatten(record))))).slice(0, 150)
    const totalValue = Number(upstream.headers.get('x-pagination-total') || payload?.meta?.total || payload?.total || 0)
    const pagesValue = Number(upstream.headers.get('x-pagination-pages') || payload?.meta?.last_page || payload?.totalPages || 0)
    return NextResponse.json({
      records,
      rawCount,
      fields,
      page,
      pageSize,
      total: Number.isFinite(totalValue) && totalValue > 0 ? totalValue : null,
      totalPages: Number.isFinite(pagesValue) && pagesValue > 0 ? pagesValue : null,
      sample: first,
      paginationNote: pagesValue ? null : 'Pagination fournie par défaut à l’API si elle la prend en charge.',
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  } catch (error) {
    console.error('[prospection] search failed:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Impossible de contacter l’API.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorize()
  if ('response' in auth) return auth.response
  try {
    const body = await request.json()
    if (body?.action !== 'save-list' || typeof body.name !== 'string' || !body.name.trim() || !Array.isArray(body.records) || body.records.length === 0 || body.records.length > 5000) {
      return NextResponse.json({ error: 'Nom de liste ou résultats invalides (maximum 5 000 contacts par sauvegarde).' }, { status: 400 })
    }
    const admin = createAdminClient()
    const user = auth.profile
    const listResult = await admin.from('listes').insert({
      nom: body.name.trim().slice(0, 120),
      description: typeof body.description === 'string' ? body.description.slice(0, 500) : 'Liste générée depuis Prospection API',
      cible: typeof body.target === 'string' ? body.target.slice(0, 240) : 'Prospection API',
      note: typeof body.note === 'string' ? body.note.slice(0, 1000) : null,
      ajoute_par_nom: [user.prenom, user.nom].filter(Boolean).join(' '),
      created_by: Number(user.id),
    }).select('id').single()
    if (listResult.error || !listResult.data) throw listResult.error || new Error('Création de la liste impossible.')
    const listId = Number(listResult.data.id)
    const rows = body.records.map((record: any) => {
      const values = flatten(record)
      const get = (...names: string[]) => {
        for (const name of names) {
          const key = Object.keys(values).find(k => k.toLowerCase() === name.toLowerCase())
          if (key && values[key]) return values[key].slice(0, 500)
        }
        return ''
      }
      const fullName = get('name', 'nom', 'full_name', 'fullname', 'contact_name')
      const firstName = get('first_name', 'firstname', 'prenom', 'given_name')
      const lastName = get('last_name', 'lastname', 'surname', 'family_name')
      const email = get('email', 'e-mail', 'mail')
      const phone = get('phone', 'telephone', 'tel', 'mobile', 'phone_number')
      const city = get('city', 'ville', 'locality')
      const postal = get('postal_code', 'postcode', 'zip', 'zipcode', 'code_postal')
      const address = get('address', 'street', 'adresse')
      const country = get('country', 'pays')
      const age = get('age')
      const extra = Object.entries(values).filter(([key]) => !/^(id|name|nom|full_name|fullname|first_name|firstname|prenom|last_name|lastname|surname|family_name|email|e-mail|mail|phone|telephone|tel|mobile|phone_number|city|ville|locality|postal_code|postcode|zip|zipcode|code_postal|address|street|adresse|country|pays|age)$/i.test(key)).map(([k,v]) => `${k}: ${v}`).join(' | ')
      return {
        nom: fullName || lastName || firstName || email || phone || 'Contact',
        prenom: firstName || null,
        email: email || null,
        telephone: phone || null,
        mobile: phone || null,
        ville: city || null,
        code_postal: postal || null,
        address: address || null,
        pays: country || null,
        age: age && /^\d+$/.test(age) ? Number(age) : null,
        commentaire: [extra, country ? `Pays: ${country}` : '', age ? `Âge: ${age}` : ''].filter(Boolean).join(' | ') || null,
        created_by: Number(user.id),
      }
    }).filter((row: any) => row.email || row.telephone || row.nom)
    if (rows.length === 0) throw new Error('Aucun contact exploitable dans les résultats.')
    const insertedIds: number[] = []
    for (let offset = 0; offset < rows.length; offset += 250) {
      const batch = await admin.from('contacts').insert(rows.slice(offset, offset + 250)).select('id')
      if (batch.error || !batch.data) throw batch.error || new Error('Import des contacts impossible.')
      insertedIds.push(...batch.data.map((contact: { id: number }) => Number(contact.id)))
    }
    for (let offset = 0; offset < insertedIds.length; offset += 250) {
      const links = insertedIds.slice(offset, offset + 250).map(contact_id => ({ liste_id: listId, contact_id }))
      const linked = await admin.from('liste_contacts').insert(links)
      if (linked.error) throw linked.error
    }
    return NextResponse.json({ success: true, listId, saved: insertedIds.length })
  } catch (error) {
    console.error('[prospection] save list failed:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Sauvegarde impossible.' }, { status: 500 })
  }
}
