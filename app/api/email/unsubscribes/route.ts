import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function auth() {
  const session = await createClient()
  const { data, error } = await session.auth.getUser()
  if (error || !data.user) return { error: NextResponse.json({ error: 'Authentification requise.' }, { status: 401 }) }

  const { data: profile } = await session.from('user_profiles')
    .select('id,role_id')
    .eq('auth_user_id', data.user.id)
    .maybeSingle()
  if (!profile) return { error: NextResponse.json({ error: 'Profil introuvable.' }, { status: 403 }) }

  const { data: allowed, error: permissionError } = await session.rpc('has_permission', { permission_code: 'email.access' })
  if (permissionError || (Number(profile.role_id) !== 1 && !allowed)) {
    return { error: NextResponse.json({ error: 'Accès refusé.' }, { status: 403 }) }
  }
  return { profile }
}

export async function GET() {
  const access = await auth()
  if ('error' in access) return access.error

  const { data, error } = await createAdminClient().from('email_unsubscribes')
    .select('id,email,reason,unsubscribed_at')
    .order('unsubscribed_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Chargement des désabonnements impossible.' }, { status: 500 })
  return NextResponse.json({ unsubscribes: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const access = await auth()
  if ('error' in access) return access.error

  try {
    const body = await request.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const reason = String(body.reason ?? '').trim().slice(0, 500)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Adresse e-mail invalide.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: existing, error: lookupError } = await admin.from('email_unsubscribes')
      .select('id')
      .ilike('email', email)
      .maybeSingle()
    if (lookupError) throw lookupError

    const payload = {
      email,
      reason: reason || 'Exclusion manuelle',
      unsubscribed_at: new Date().toISOString(),
    }
    const result = existing
      ? await admin.from('email_unsubscribes').update(payload).eq('id', existing.id)
      : await admin.from('email_unsubscribes').insert(payload).select('id,email,reason,unsubscribed_at').single()
    if (result.error) throw result.error

    return NextResponse.json({ success: true, unsubscribe: 'data' in result ? result.data : null }, { status: 201 })
  } catch (error) {
    console.error('[email/unsubscribes] POST failed:', error)
    return NextResponse.json({ error: 'Ajout à la liste d’exclusion impossible.' }, { status: 500 })
  }
}
