import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function originError(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin) return NextResponse.json({ error: 'Origine manquante.' }, { status: 403 })
  try {
    if (new URL(origin).origin !== request.nextUrl.origin) return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403 })
  } catch { return NextResponse.json({ error: 'Origine invalide.' }, { status: 403 }) }
  return null
}

async function authorized() {
  const session = await createClient()
  const { data: auth, error: authError } = await session.auth.getUser()
  if (authError || !auth.user) return { error: NextResponse.json({ error: 'Authentification requise.' }, { status: 401 }) }
  const { data: profile, error } = await session.from('user_profiles').select('id,role_id').eq('auth_user_id', auth.user.id).maybeSingle()
  if (error || !profile) return { error: NextResponse.json({ error: 'Profil utilisateur introuvable.' }, { status: 403 }) }
  const { data: allowed, error: permissionError } = await session.rpc('has_permission', { permission_code: 'email.access' })
  if (Number(profile.role_id) !== 1 && (permissionError || !allowed)) return { error: NextResponse.json({ error: 'Accès e-mail refusé.' }, { status: 403 }) }
  return { profile }
}

export async function POST(request: NextRequest) {
  const origin = originError(request)
  if (origin) return origin
  const auth = await authorized()
  if ('error' in auth) return auth.error

  try {
    const body = await request.json()
    const smtpId = Number(body.smtp_account_id)
    const listeIds = Array.from(new Set((Array.isArray(body.liste_ids) ? body.liste_ids : [body.liste_id]).map(Number).filter((id: number) => Number.isSafeInteger(id) && id > 0)))
    const subject = String(body.subject ?? '').trim().slice(0, 250)
    const message = String(body.message ?? '').trim().slice(0, 50000)
    const replyTo = String(body.reply_to ?? '').trim().slice(0, 254)
    const batchSize = Math.min(100, Math.max(1, Number(body.batch_size) || 25))
    const batchDelay = Math.min(3600, Math.max(0, Number(body.batch_delay_seconds) || 0))
    const scheduledAt = body.scheduled_at ? new Date(body.scheduled_at) : new Date()
    const templateId = body.template_id ? Number(body.template_id) : null
    if (!Number.isSafeInteger(smtpId) || smtpId < 1 || !listeIds.length || !subject || !message || Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ error: 'Vérifiez l’expéditeur, les listes, l’objet, le contenu et la date de lancement.' }, { status: 400 })
    }
    if (scheduledAt.getTime() < Date.now() - 60000) return NextResponse.json({ error: 'La date de lancement doit être dans le futur ou maintenant.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: smtp, error: smtpError } = await admin.from('smtp_accounts').select('id,name,email,from_name,is_active').eq('id', smtpId).eq('is_active', true).maybeSingle()
    if (smtpError || !smtp) return NextResponse.json({ error: 'Compte SMTP introuvable ou désactivé.' }, { status: 404 })
    const { data: lists, error: listsError } = await admin.from('listes').select('id,nom').in('id', listeIds)
    if (listsError || (lists ?? []).length !== listeIds.length) return NextResponse.json({ error: 'Une ou plusieurs listes sont introuvables.' }, { status: 404 })
    const { data: links, error: linksError } = await admin.from('liste_contacts').select('contact_id').in('liste_id', listeIds)
    if (linksError) throw linksError
    const contactIds = Array.from(new Set((links ?? []).map((x) => Number(x.contact_id)).filter(Number.isSafeInteger)))
    if (!contactIds.length) return NextResponse.json({ error: 'Les listes sélectionnées ne contiennent aucun contact.' }, { status: 400 })
    const { data: contacts, error: contactsError } = await admin.from('contacts').select('email').in('id', contactIds)
    if (contactsError) throw contactsError
    let recipients = Array.from(new Set((contacts ?? []).map((x) => String(x.email ?? '').trim().toLowerCase()).filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))))
    const { data: suppressed, error: suppressedError } = await admin.from('email_unsubscribes').select('email')
    if (suppressedError) throw suppressedError
    const excluded = new Set((suppressed ?? []).map((x) => String(x.email).toLowerCase()))
    recipients = recipients.filter((email) => !excluded.has(email))
    if (!recipients.length) return NextResponse.json({ error: 'Aucun destinataire valide après exclusion des désabonnements.' }, { status: 400 })
    if (recipients.length > 5000) return NextResponse.json({ error: 'Maximum 5 000 destinataires par campagne.' }, { status: 400 })

    const status = scheduledAt.getTime() > Date.now() ? 'scheduled' : 'pending'
    const { data: campaign, error: insertError } = await admin.from('email_campaigns').insert({
      smtp_account_id: smtp.id, liste_id: listeIds[0], liste_ids: listeIds,
      created_by: auth.profile.id, sender_email: smtp.email, sender_name: smtp.from_name || smtp.name,
      liste_nom: lists!.map((x) => x.nom).join(', '), subject, message, reply_to: replyTo || null,
      template_id: templateId, tracking_opens: body.tracking_opens !== false,
      tracking_clicks: body.tracking_clicks !== false, batch_size: batchSize,
      batch_delay_seconds: batchDelay, recipients, total_recipients: recipients.length,
      sent_count: 0, failed_count: 0, failed_recipients: [], recipient_offset: 0,
      scheduled_at: scheduledAt.toISOString(), next_batch_at: scheduledAt.toISOString(),
      status, started_at: null, worker_locked_at: null, updated_at: new Date().toISOString(),
    }).select('id,status,subject,total_recipients,scheduled_at').single()
    if (insertError) throw insertError
    return NextResponse.json({ success: true, campaign, message: status === 'scheduled' ? 'Campagne planifiée.' : 'Campagne ajoutée à la file d’envoi.' }, { status: 201 })
  } catch (error) {
    console.error('[email/campaigns] create failed:', error)
    return NextResponse.json({ error: 'Impossible de préparer cette campagne.' }, { status: 500 })
  }
}
