import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function authorize() {
  const session = await createClient()
  const { data: auth, error } = await session.auth.getUser()
  if (error || !auth.user) return { response: NextResponse.json({ error: 'Authentification requise.' }, { status: 401 }) }
  const { data: profile, error: profileError } = await session.from('user_profiles')
    .select('id, role_id').eq('auth_user_id', auth.user.id).maybeSingle()
  if (profileError || !profile) return { response: NextResponse.json({ error: 'Profil introuvable.' }, { status: 403 }) }
  const isAdmin = Number(profile.role_id) === 1
  const { data: allowed, error: permissionError } = await session.rpc('has_permission', { permission_code: 'email.access' })
  if (permissionError || (!isAdmin && !allowed)) return { response: NextResponse.json({ error: 'Accès e-mail refusé.' }, { status: 403 }) }
  return { profile, isAdmin }
}

function checkOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try { return new URL(origin).origin === request.nextUrl.origin } catch { return false }
}

export async function GET(request: NextRequest) {
  const auth = await authorize()
  if ('response' in auth) return auth.response
  const admin = createAdminClient()
  const [templates, unsubscribes, campaigns, recipients] = await Promise.all([
    admin.from('email_templates').select('id,name,subject,content,created_at,updated_at').order('updated_at', { ascending: false }),
    admin.from('email_unsubscribes').select('id,email,unsubscribed_at,source').order('unsubscribed_at', { ascending: false }).limit(1000),
    admin.from('email_campaigns').select('id,subject,total_recipients,sent_count,failed_count,status,created_at,sent_at').order('created_at', { ascending: false }).limit(100),
    admin.from('email_campaign_recipients').select('campaign_id,opened_at,clicked_at'),
  ])
  if (templates.error || unsubscribes.error || campaigns.error || recipients.error) {
    console.error('[email/manage] GET failed:', templates.error || unsubscribes.error || campaigns.error || recipients.error)
    return NextResponse.json({ error: 'Impossible de charger les données e-mail.' }, { status: 500 })
  }
  const events = new Map<number, { opened: number; clicked: number }>()
  for (const item of recipients.data ?? []) {
    const id = Number(item.campaign_id)
    const current = events.get(id) ?? { opened: 0, clicked: 0 }
    if (item.opened_at) current.opened += 1
    if (item.clicked_at) current.clicked += 1
    events.set(id, current)
  }
  const enrichedCampaigns = (campaigns.data ?? []).map((campaign) => ({ ...campaign, opened_count: events.get(Number(campaign.id))?.opened ?? 0, clicked_count: events.get(Number(campaign.id))?.clicked ?? 0 }))
  return NextResponse.json({ templates: templates.data ?? [], unsubscribes: unsubscribes.data ?? [], campaigns: enrichedCampaigns }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403 })
  const auth = await authorize()
  if ('response' in auth) return auth.response
  const body = await request.json()
  const admin = createAdminClient()
  if (body.action === 'unsubscribe') {
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Adresse e-mail invalide.' }, { status: 400 })
    const { data, error } = await admin.from('email_unsubscribes').upsert({ email, source: 'manual' }, { onConflict: 'email' }).select().single()
    if (error) return NextResponse.json({ error: 'Ajout à la liste de suppression impossible.' }, { status: 500 })
    return NextResponse.json({ unsubscribe: data })
  }
  const name = String(body.name ?? '').trim().slice(0, 120)
  const subject = String(body.subject ?? '').trim().slice(0, 250)
  const content = String(body.content ?? '').slice(0, 50000)
  if (!name || !content) return NextResponse.json({ error: 'Le nom et le contenu du modèle sont obligatoires.' }, { status: 400 })
  const { data, error } = await admin.from('email_templates').insert({ name, subject, content, created_by: Number(auth.profile.id) })
    .select('id,name,subject,content,created_at,updated_at').single()
  if (error) return NextResponse.json({ error: 'Création du modèle impossible.' }, { status: 500 })
  return NextResponse.json({ template: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403 })
  const auth = await authorize()
  if ('response' in auth) return auth.response
  const body = await request.json()
  const id = Number(body.id)
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 })
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.name === 'string') update.name = body.name.trim().slice(0, 120)
  if (typeof body.subject === 'string') update.subject = body.subject.trim().slice(0, 250)
  if (typeof body.content === 'string') update.content = body.content.slice(0, 50000)
  const admin = createAdminClient()
  const { data, error } = await admin.from('email_templates').update(update).eq('id', id)
    .select('id,name,subject,content,created_at,updated_at').single()
  if (error) return NextResponse.json({ error: 'Modification du modèle impossible.' }, { status: 500 })
  return NextResponse.json({ template: data })
}

export async function DELETE(request: NextRequest) {
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403 })
  const auth = await authorize()
  if ('response' in auth) return auth.response
  const body = await request.json()
  const id = Number(body.id)
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 })
  const admin = createAdminClient()
  const { error } = await admin.from('email_templates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Suppression du modèle impossible.' }, { status: 500 })
  return NextResponse.json({ success: true })
}
