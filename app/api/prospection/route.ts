import { NextRequest, NextResponse } from 'next/server'
import { createDecipheriv } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ApiConfig = {
  base_url: string
  auth_type: 'none' | 'bearer' | 'api_key'
  auth_header: string
  encrypted_secret: string | null
}

function decryptSecret(value: string) {
  const rawKey = process.env.PROSPECTION_CONFIG_ENCRYPTION_KEY
  if (!rawKey) throw new Error('La variable PROSPECTION_CONFIG_ENCRYPTION_KEY est absente.')
  const key = Buffer.from(rawKey, 'base64')
  if (key.length !== 32) throw new Error('La clé de chiffrement Prospection est invalide.')
  const [ivPart, tagPart, encryptedPart] = value.split('.')
  if (!ivPart || !tagPart || !encryptedPart) throw new Error('La clé API enregistrée est illisible.')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64'))
  decipher.setAuthTag(Buffer.from(tagPart, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(encryptedPart, 'base64')), decipher.final()]).toString('utf8')
}

async function getAuthenticatedProfile() {
  const supabase = await createClient()
  const { data: auth, error } = await supabase.auth.getUser()
  if (error || !auth.user) return { error: NextResponse.json({ error: 'Authentification requise.' }, { status: 401 }) }
  const { data: profile, error: profileError } = await supabase.from('user_profiles').select('id').eq('auth_user_id', auth.user.id).maybeSingle()
  if (profileError || !profile) return { error: NextResponse.json({ error: 'Profil utilisateur introuvable.' }, { status: 403 }) }
  return { profile }
}

async function loadApiConfig(): Promise<ApiConfig> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('prospection_api_config').select('base_url,auth_type,auth_header,encrypted_secret').eq('id', true).maybeSingle()
  if (error) {
    if ((error as { code?: string }).code === 'PGRST205') throw new Error('La table prospection_api_config manque dans Supabase. Appliquez les migrations Prospection.')
    throw new Error('Impossible de lire la configuration API.')
  }
  if (!data?.base_url) throw new Error('Aucune URL API configurée. Ajoutez-la dans Paramètres → Connexion API — Prospection.')
  return data as ApiConfig
}

function makeHeaders(config: ApiConfig) {
  const headers = new Headers({ Accept: 'application/json' })
  if (config.encrypted_secret) {
    const secret = decryptSecret(config.encrypted_secret)
    if (config.auth_type === 'bearer') headers.set('Authorization', `Bearer ${secret}`)
    if (config.auth_type === 'api_key') headers.set(config.auth_header || 'x-api-key', secret)
  }
  return headers
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedProfile()
  if ('error' in auth) return auth.error
  try {
    const config = await loadApiConfig()
    const endpoint = new URL(config.base_url)
    if (endpoint.protocol !== 'https:' && endpoint.hostname !== 'localhost' && endpoint.hostname !== '127.0.0.1') {
      return NextResponse.json({ error: 'L’URL API doit utiliser HTTPS.' }, { status: 400 })
    }
    const incoming = request.nextUrl.searchParams
    const page = Math.max(1, Math.min(10000, Number(incoming.get('page') || 1)))
    const perPage = Math.max(1, Math.min(100, Number(incoming.get('per_page') || 10)))
    endpoint.searchParams.set('page', String(page))
    endpoint.searchParams.set('per_page', String(perPage))
    for (const key of ['name', 'email', 'gender', 'status']) {
      const value = incoming.get(key)?.trim()
      if (value) endpoint.searchParams.set(key, value.slice(0, 200))
    }
    const upstream = await fetch(endpoint, { headers: makeHeaders(config), cache: 'no-store', signal: AbortSignal.timeout(15000) })
    const body = await upstream.json().catch(() => null)
    if (!upstream.ok) {
      const message = upstream.status === 401 ? 'L’API a refusé la clé. Vérifiez le type d’authentification et le token.' :
        upstream.status === 429 ? 'Limite de requêtes API atteinte. Réessayez dans un instant.' :
        `L’API externe a répondu avec le statut ${upstream.status}.`
      return NextResponse.json({ error: message, details: body }, { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 })
    }
    const prospects = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : null
    if (!prospects) return NextResponse.json({ error: 'Format API non reconnu : une liste de contacts est attendue.' }, { status: 502 })
    return NextResponse.json({
      prospects,
      page,
      perPage,
      total: Number(upstream.headers.get('x-pagination-total') || body?.meta?.total || 0) || null,
      totalPages: Number(upstream.headers.get('x-pagination-pages') || 0) || null,
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  } catch (error) {
    console.error('[prospection] API read failed:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Impossible de contacter l’API.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedProfile()
  if ('error' in auth) return auth.error
  try {
    const body = await request.json()
    const prospect = body?.prospect
    if (!prospect || (typeof prospect.id !== 'string' && typeof prospect.id !== 'number') ||
      typeof prospect.name !== 'string' || typeof prospect.email !== 'string') {
      return NextResponse.json({ error: 'Données prospect invalides.' }, { status: 400 })
    }
    const admin = createAdminClient()
    const { error } = await admin.from('prospection_leads').upsert({
      source_id: String(prospect.id).slice(0, 160),
      name: prospect.name.trim().slice(0, 200),
      email: prospect.email.trim().slice(0, 254).toLowerCase(),
      gender: typeof prospect.gender === 'string' ? prospect.gender.slice(0, 30) : null,
      status: typeof prospect.status === 'string' ? prospect.status.slice(0, 30) : null,
      source: 'configured_api',
      saved_by: Number(auth.profile.id),
      raw_data: prospect,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'source_id' })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[prospection] lead save failed:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Enregistrement impossible.' }, { status: 500 })
  }
}
