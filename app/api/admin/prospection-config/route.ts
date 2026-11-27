import { NextResponse, type NextRequest } from 'next/server'
import { createDecipheriv, createCipheriv, randomBytes } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sameOriginError } from '@/lib/api/request-security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function encryptSecret(secret: string) {
  const rawKey = process.env.PROSPECTION_CONFIG_ENCRYPTION_KEY
  if (!rawKey) throw new Error('La variable PROSPECTION_CONFIG_ENCRYPTION_KEY est absente.')
  const key = Buffer.from(rawKey, 'base64')
  if (key.length !== 32) throw new Error('PROSPECTION_CONFIG_ENCRYPTION_KEY doit être une clé base64 de 32 octets.')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.')
}


async function authorizeAdmin() {
  const session = await createClient()
  const { data: auth, error } = await session.auth.getUser()
  if (error || !auth.user) return { response: NextResponse.json({ error: 'Authentification requise.' }, { status: 401 }) } as const
  const { data: profile, error: profileError } = await session.from('user_profiles').select('id,role_id').eq('auth_user_id', auth.user.id).maybeSingle()
  if (profileError || !profile || Number(profile.role_id) !== 1) {
    return { response: NextResponse.json({ error: 'Réservé à l’administrateur.' }, { status: 403 }) } as const
  }
  return { profile } as const
}

export async function GET() {
  const auth = await authorizeAdmin()
  if ('response' in auth) return auth.response
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('prospection_api_config').select('base_url,auth_type,auth_header,encrypted_secret,updated_at').eq('id', true).maybeSingle()
    if (error) throw error
    return NextResponse.json({
      config: {
        baseUrl: data?.base_url ?? '',
        authType: data?.auth_type ?? 'bearer',
        authHeader: data?.auth_header ?? 'x-api-key',
        secretConfigured: Boolean(data?.encrypted_secret),
        secretPreview: data?.encrypted_secret ? '••••••••••••' : '',
        updatedAt: data?.updated_at ?? null,
      },
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  } catch (error) {
    console.error('[prospection-config] read failed:', error)
    return NextResponse.json({ error: 'Impossible de charger la configuration API.' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const originError = sameOriginError(request)
  if (originError) return originError
  const auth = await authorizeAdmin()
  if ('response' in auth) return auth.response
  try {
    const body = await request.json()
    const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim().slice(0, 2000) : ''
    const authType = ['none', 'bearer', 'api_key'].includes(body.authType) ? body.authType : 'bearer'
    const authHeader = typeof body.authHeader === 'string' ? body.authHeader.trim().slice(0, 80) : 'x-api-key'
    const secret = typeof body.secret === 'string' ? body.secret.trim().slice(0, 4000) : ''
    if (baseUrl) {
      let parsed: URL
      try { parsed = new URL(baseUrl) } catch { return NextResponse.json({ error: 'URL API invalide.' }, { status: 400 }) }
      if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
        return NextResponse.json({ error: 'L’API doit utiliser HTTPS.' }, { status: 400 })
      }
    }
    if (authType === 'api_key' && !/^[a-zA-Z0-9-]+$/.test(authHeader)) {
      return NextResponse.json({ error: 'Nom d’en-tête API invalide.' }, { status: 400 })
    }
    const admin = createAdminClient()
    const { data: current, error: readError } = await admin.from('prospection_api_config').select('encrypted_secret').eq('id', true).maybeSingle()
    if (readError) throw readError
    let encryptedSecret = current?.encrypted_secret ?? null
    if (body.clearSecret === true) encryptedSecret = null
    else if (secret) encryptedSecret = encryptSecret(secret)
    const { error } = await admin.from('prospection_api_config').upsert({
      id: true,
      base_url: baseUrl,
      auth_type: authType,
      auth_header: authHeader,
      encrypted_secret: encryptedSecret,
      updated_by: Number(auth.profile.id),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    if (error) throw error
    return NextResponse.json({ success: true, message: 'Configuration API enregistrée.', secretConfigured: Boolean(encryptedSecret) })
  } catch (error) {
    console.error('[prospection-config] save failed:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Enregistrement impossible.' }, { status: 500 })
  }
}
