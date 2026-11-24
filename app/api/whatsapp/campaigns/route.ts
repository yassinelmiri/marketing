import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CampaignStatus = 'draft' | 'in_progress' | 'paused' | 'completed'
type RecipientStatus = 'pending' | 'opened' | 'sent' | 'failed' | 'skipped'

async function authorize() {
  const session = await createClient()
  const { data: auth, error: authError } = await session.auth.getUser()
  if (authError || !auth.user) {
    return { response: NextResponse.json({ error: 'Connexion requise.' }, { status: 401 }) }
  }

  const { data: profile, error } = await session
    .from('user_profiles')
    .select('id, role_id')
    .eq('auth_user_id', auth.user.id)
    .maybeSingle()

  if (error || !profile) {
    return { response: NextResponse.json({ error: 'Profil utilisateur introuvable.' }, { status: 403 }) }
  }

  if (Number(profile.role_id) !== 1) {
    const { data: allowed, error: permissionError } = await session.rpc('has_permission', {
      permission_code: 'whatsapp.access',
    })
    if (permissionError || !allowed) {
      return { response: NextResponse.json({ error: 'Accès WhatsApp refusé.' }, { status: 403 }) }
    }
  }

  try {
    return { admin: createAdminClient(), userId: Number(profile.id) } as const
  } catch {
    return { response: NextResponse.json({ error: 'Configuration serveur indisponible.' }, { status: 503 }) }
  }
}

function originCheck(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin) return NextResponse.json({ error: 'Origin manquant.' }, { status: 403 })
  try {
    if (new URL(origin).origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: 'Origin refusé.' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Origin invalide.' }, { status: 403 })
  }
  return null
}

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function validRecipientStatus(value: unknown): value is RecipientStatus {
  return ['pending', 'opened', 'sent', 'failed', 'skipped'].includes(String(value))
}

function validCampaignStatus(value: unknown): value is CampaignStatus {
  return ['draft', 'in_progress', 'paused', 'completed'].includes(String(value))
}

export async function GET(request: NextRequest) {
  const auth = await authorize()
  if ('response' in auth) return auth.response

  const campaignId = Number(request.nextUrl.searchParams.get('id') ?? 0)
  if (campaignId > 0) {
    const { data: campaign, error } = await auth.admin
      .from('whatsapp_campaigns')
      .select('id,user_id,name,source_file,message,consent_confirmed_at,status,total_recipients,created_at,updated_at')
      .eq('id', campaignId)
      .eq('user_id', auth.userId)
      .maybeSingle()

    if (error) return NextResponse.json({ error: 'Chargement de la campagne impossible.' }, { status: 500 })
    if (!campaign) return NextResponse.json({ error: 'Campagne introuvable.' }, { status: 404 })

    const { data: recipients, error: recipientsError } = await auth.admin
      .from('whatsapp_campaign_recipients')
      .select('id,contact_name,phone,status')
      .eq('campaign_id', campaignId)
      .order('id', { ascending: true })

    if (recipientsError) return NextResponse.json({ error: 'Chargement des destinataires impossible.' }, { status: 500 })
    return NextResponse.json({ campaign, recipients: recipients ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const { data: campaigns, error } = await auth.admin
    .from('whatsapp_campaigns')
    .select('id,name,source_file,message,status,total_recipients,created_at,updated_at')
    .eq('user_id', auth.userId)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: 'Chargement des campagnes impossible.' }, { status: 500 })
  return NextResponse.json({ campaigns: campaigns ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const origin = originCheck(request)
  if (origin) return origin
  const auth = await authorize()
  if ('response' in auth) return auth.response

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const name = cleanText(body.name, 160)
  const message = cleanText(body.message, 10000)
  const sourceFile = cleanText(body.source_file, 255)
  const recipients = Array.isArray(body.recipients) ? body.recipients : []

  if (!name || !message || body.consent_confirmed !== true) {
    return NextResponse.json({ error: 'Nom, message et confirmation du consentement obligatoires.' }, { status: 400 })
  }
  if (!recipients.length || recipients.length > 5000) {
    return NextResponse.json({ error: 'La campagne doit contenir entre 1 et 5 000 destinataires.' }, { status: 400 })
  }

  const cleanRecipients: { contact_name: string; phone: string; status: RecipientStatus }[] = []
  const seen = new Set<string>()
  for (const item of recipients) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const phone = cleanText(row.phone, 20).replace(/\D/g, '')
    if (!phone || phone.length < 8 || phone.length > 15 || seen.has(phone)) continue
    seen.add(phone)
    cleanRecipients.push({ contact_name: cleanText(row.name, 160), phone, status: 'pending' })
  }

  if (!cleanRecipients.length) {
    return NextResponse.json({ error: 'Aucun numéro valide à enregistrer.' }, { status: 400 })
  }

  const { data: campaign, error: createError } = await auth.admin
    .from('whatsapp_campaigns')
    .insert({
      user_id: auth.userId,
      name,
      source_file: sourceFile,
      message,
      consent_confirmed_at: new Date().toISOString(),
      status: 'draft',
      total_recipients: cleanRecipients.length,
    })
    .select('id,name,source_file,message,status,total_recipients,created_at,updated_at')
    .single()

  if (createError || !campaign) {
    console.error('[whatsapp/campaigns] campaign insert failed:', createError?.message)
    return NextResponse.json({ error: 'Création de la campagne impossible.' }, { status: 500 })
  }

  const rows = cleanRecipients.map((recipient) => ({ ...recipient, campaign_id: campaign.id }))
  for (let offset = 0; offset < rows.length; offset += 500) {
    const { error: insertError } = await auth.admin
      .from('whatsapp_campaign_recipients')
      .insert(rows.slice(offset, offset + 500))

    if (insertError) {
      console.error('[whatsapp/campaigns] recipients insert failed:', insertError.message)
      await auth.admin.from('whatsapp_campaigns').delete().eq('id', campaign.id).eq('user_id', auth.userId)
      return NextResponse.json({ error: 'Enregistrement des destinataires impossible. La campagne a été annulée.' }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, campaign }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const origin = originCheck(request)
  if (origin) return origin
  const auth = await authorize()
  if ('response' in auth) return auth.response

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const campaignId = Number(body.campaign_id)
  if (!Number.isSafeInteger(campaignId) || campaignId <= 0) {
    return NextResponse.json({ error: 'Identifiant de campagne invalide.' }, { status: 400 })
  }

  const { data: campaign, error: campaignError } = await auth.admin
    .from('whatsapp_campaigns')
    .select('id,status')
    .eq('id', campaignId)
    .eq('user_id', auth.userId)
    .maybeSingle()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campagne introuvable.' }, { status: 404 })
  }

  const now = new Date().toISOString()
  if (typeof body.message === 'string') {
    const message = cleanText(body.message, 10000)
    if (!message) return NextResponse.json({ error: 'Le message ne peut pas être vide.' }, { status: 400 })
    const { error } = await auth.admin.from('whatsapp_campaigns')
      .update({ message, updated_at: now })
      .eq('id', campaignId)
      .eq('user_id', auth.userId)
    if (error) return NextResponse.json({ error: 'Enregistrement du message impossible.' }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (body.recipient_id !== undefined) {
    const recipientId = Number(body.recipient_id)
    const status = body.recipient_status
    if (!Number.isSafeInteger(recipientId) || recipientId <= 0 || !validRecipientStatus(status)) {
      return NextResponse.json({ error: 'Destinataire ou statut invalide.' }, { status: 400 })
    }

    const { error } = await auth.admin
      .from('whatsapp_campaign_recipients')
      .update({ status, updated_at: now })
      .eq('id', recipientId)
      .eq('campaign_id', campaignId)

    if (error) return NextResponse.json({ error: 'Mise à jour du destinataire impossible.' }, { status: 500 })

    const { data: statuses, error: statusesError } = await auth.admin
      .from('whatsapp_campaign_recipients')
      .select('status')
      .eq('campaign_id', campaignId)

    if (statusesError) return NextResponse.json({ error: 'Actualisation du suivi impossible.' }, { status: 500 })
    const allDone = (statuses ?? []).length > 0 && (statuses ?? []).every((row) => ['sent', 'failed', 'skipped'].includes(row.status))
    const nextStatus: CampaignStatus = allDone ? 'completed' : 'in_progress'
    await auth.admin.from('whatsapp_campaigns').update({ status: nextStatus, updated_at: now }).eq('id', campaignId).eq('user_id', auth.userId)
    return NextResponse.json({ success: true, campaign_status: nextStatus })
  }

  const status = body.status
  if (!validCampaignStatus(status)) return NextResponse.json({ error: 'Statut de campagne invalide.' }, { status: 400 })
  const { error } = await auth.admin
    .from('whatsapp_campaigns')
    .update({ status, updated_at: now })
    .eq('id', campaignId)
    .eq('user_id', auth.userId)

  if (error) return NextResponse.json({ error: 'Mise à jour de la campagne impossible.' }, { status: 500 })
  return NextResponse.json({ success: true, status })
}
