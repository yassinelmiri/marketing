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
  const { data: profile, error } = await session.from('user_profiles').select('*').eq('auth_user_id', auth.user.id).maybeSingle()
  if (error || !profile) return { error: NextResponse.json({ error: 'Profil utilisateur introuvable.' }, { status: 403 }) }
  const { data: allowed, error: permissionError } = await session.rpc('has_permission', { permission_code: 'email.access' })
  if (Number(profile.role_id) !== 1 && (permissionError || !allowed)) return { error: NextResponse.json({ error: 'Accès e-mail refusé.' }, { status: 403 }) }
  return { profile, user: auth.user }
}

export async function POST(request: NextRequest) {
  const origin = originError(request)
  if (origin) return origin
  const auth = await authorized()
  if ('error' in auth) return auth.error

  try {
    const body = await request.json()
    const smtpIds = Array.from(new Set((Array.isArray(body.smtp_account_ids) ? body.smtp_account_ids : [body.smtp_account_id]).map(Number).filter((id: number) => Number.isSafeInteger(id) && id > 0)))
    const listeIds = Array.from(new Set((Array.isArray(body.liste_ids) ? body.liste_ids : [body.liste_id]).map(Number).filter((id: number) => Number.isSafeInteger(id) && id > 0)))
    const subject = String(body.subject ?? '').trim().slice(0, 250)
    const message = String(body.message ?? '').trim().slice(0, 50000)
    const replyTo = String(body.reply_to ?? '').trim().slice(0, 254)
    const batchSize = Math.min(100, Math.max(1, Number(body.batch_size) || 25))
    const batchDelay = Math.min(3600, Math.max(0, Number(body.batch_delay_seconds) || 0))
    const scheduledAt = body.scheduled_at ? new Date(body.scheduled_at) : new Date()
    const templateId = body.template_id ? Number(body.template_id) : null
    if (!smtpIds.length || !listeIds.length || !subject || !message || Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ error: 'Vérifiez l’expéditeur, les listes, l’objet, le contenu et la date de lancement.' }, { status: 400 })
    }
    if (scheduledAt.getTime() < Date.now() - 60000) return NextResponse.json({ error: 'La date de lancement doit être dans le futur ou maintenant.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: smtpAccounts, error: smtpError } = await admin.from('smtp_accounts').select('id,name,email,from_name,is_active').in('id', smtpIds).eq('is_active', true)
    if (smtpError || (smtpAccounts ?? []).length !== smtpIds.length) return NextResponse.json({ error: 'Un ou plusieurs comptes expéditeurs sont introuvables ou désactivés.' }, { status: 404 })
    const orderedSmtp = smtpIds.map(id => smtpAccounts!.find(account => Number(account.id) === id)!).filter(Boolean)
    const primarySmtp = orderedSmtp[0]
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
      smtp_account_id: primarySmtp.id, smtp_account_ids: smtpIds, liste_id: listeIds[0], liste_ids: listeIds,
      created_by: auth.profile.id,
      created_by_name: String((auth.profile as Record<string, unknown>).full_name || (auth.profile as Record<string, unknown>).name || (auth.profile as Record<string, unknown>).nom_complet || [(auth.profile as Record<string, unknown>).prenom, (auth.profile as Record<string, unknown>).nom].filter(Boolean).join(' ') || auth.user.user_metadata?.full_name || auth.user.user_metadata?.name || auth.user.email || 'Utilisateur'),
      sender_email: primarySmtp.email, sender_name: primarySmtp.from_name || primarySmtp.name,
      liste_nom: lists!.map((x) => x.nom).join(', '), subject, message, reply_to: replyTo || null,
      template_id: templateId, tracking_opens: body.tracking_opens !== false,
      tracking_clicks: body.tracking_clicks !== false, batch_size: batchSize,
      batch_delay_seconds: batchDelay, recipients, total_recipients: recipients.length,
      sent_count: 0, failed_count: 0, failed_recipients: [], recipient_offset: 0,
      scheduled_at: scheduledAt.toISOString(), next_batch_at: scheduledAt.toISOString(), sent_at: null,
      status, started_at: null, worker_locked_at: null, updated_at: new Date().toISOString(),
    }).select('id,status,subject,total_recipients,scheduled_at').single()
    if (insertError) throw insertError
    const recipientRows = recipients.map((email: string) => ({ campaign_id: campaign.id, email, status: 'pending' }))
    for (let offset = 0; offset < recipientRows.length; offset += 500) {
      const { error: queueError } = await admin.from('email_campaign_recipients').insert(recipientRows.slice(offset, offset + 500))
      if (queueError) {
        await admin.from('email_campaigns').delete().eq('id', campaign.id)
        throw queueError
      }
    }
    return NextResponse.json({ success: true, campaign, message: status === 'scheduled' ? 'Campagne planifiée.' : 'Campagne ajoutée à la file d’envoi.' }, { status: 201 })
  } catch (error) {
    console.error('[email/campaigns] create failed:', error)
    return NextResponse.json({ error: 'Impossible de préparer cette campagne.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const origin = originError(request)
  if (origin) return origin
  const auth = await authorized()
  if ('error' in auth) return auth.error

  try {
    const body = await request.json()
    const id = Number(body.id)
    const action = String(body.action ?? '')
    if (!Number.isSafeInteger(id) || id < 1 || !['pause', 'resume', 'edit'].includes(action)) {
      return NextResponse.json({ error: 'Action ou identifiant invalide.' }, { status: 400 })
    }
    const admin = createAdminClient()
    const { data: campaign, error: lookupError } = await admin.from('email_campaigns')
      .select('id,created_by,status,sent_count,worker_locked_at')
      .eq('id', id)
      .maybeSingle()
    if (lookupError || !campaign) return NextResponse.json({ error: 'Campagne introuvable.' }, { status: 404 })
    if (Number(auth.profile.role_id) !== 1 && Number(campaign.created_by) !== Number(auth.profile.id)) {
      return NextResponse.json({ error: 'Vous ne pouvez pas modifier cette campagne.' }, { status: 403 })
    }

    if (action === 'edit') {
      if (!['pending', 'scheduled', 'paused'].includes(campaign.status) || Number(campaign.sent_count) > 0 || campaign.worker_locked_at) {
        return NextResponse.json({ error: 'Modification impossible : la campagne a déjà commencé. Vous pouvez modifier uniquement une campagne non envoyée.' }, { status: 409 })
      }
      const subject = String(body.subject ?? '').trim().slice(0, 250)
      const message = String(body.message ?? '').trim().slice(0, 50000)
      const replyTo = String(body.reply_to ?? '').trim().slice(0, 254)
      const batchSize = Math.min(100, Math.max(1, Number(body.batch_size) || 25))
      const batchDelay = Math.min(3600, Math.max(0, Number(body.batch_delay_seconds) || 0))
      const scheduledAt = body.scheduled_at ? new Date(body.scheduled_at) : new Date()
      if (!subject || !message || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() - 60000) {
        return NextResponse.json({ error: 'Vérifiez l’objet, le contenu et la date de lancement.' }, { status: 400 })
      }
      const status = scheduledAt.getTime() > Date.now() ? 'scheduled' : 'pending'
      const { error } = await admin.from('email_campaigns').update({
        subject, message, reply_to: replyTo || null, batch_size: batchSize,
        batch_delay_seconds: batchDelay, scheduled_at: scheduledAt.toISOString(),
        next_batch_at: scheduledAt.toISOString(), status, updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
      return NextResponse.json({ success: true, message: 'Campagne modifiée.' })
    }

    if (action === 'pause') {
      if (!['pending', 'scheduled', 'sending'].includes(campaign.status)) {
        return NextResponse.json({ error: 'Cette campagne ne peut pas être mise en pause.' }, { status: 409 })
      }
      const { error } = await admin.from('email_campaigns')
        .update({ status: 'paused', next_batch_at: null, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      return NextResponse.json({ success: true, status: 'paused' })
    }

    if (campaign.status !== 'paused') {
      return NextResponse.json({ error: 'Cette campagne n’est pas en pause.' }, { status: 409 })
    }
    const now = new Date().toISOString()
    const { error } = await admin.from('email_campaigns')
      .update({ status: 'pending', next_batch_at: now, updated_at: now })
      .eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true, status: 'pending' })
  } catch (error) {
    console.error('[email/campaigns] update failed:', error)
    return NextResponse.json({ error: 'Impossible de modifier cette campagne.' }, { status: 500 })
  }
}


export async function DELETE(request: NextRequest) {
  const origin = originError(request)
  if (origin) return origin
  const auth = await authorized()
  if ('error' in auth) return auth.error
  try {
    const body = await request.json()
    const id = Number(body.id)
    if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 })
    const admin = createAdminClient()
    const { data: campaign, error: lookupError } = await admin.from('email_campaigns')
      .select('id,created_by,status,worker_locked_at')
      .eq('id', id).maybeSingle()
    if (lookupError || !campaign) return NextResponse.json({ error: 'Campagne introuvable.' }, { status: 404 })
    if (Number(auth.profile.role_id) !== 1 && Number(campaign.created_by) !== Number(auth.profile.id)) {
      return NextResponse.json({ error: 'Vous ne pouvez pas supprimer cette campagne.' }, { status: 403 })
    }
    if (campaign.status === 'sending' || campaign.worker_locked_at) {
      return NextResponse.json({ error: 'Mettez la campagne en pause et attendez la fin du traitement avant de la supprimer.' }, { status: 409 })
    }
    const { error } = await admin.from('email_campaigns').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true, message: 'Campagne supprimée.' })
  } catch (error) {
    console.error('[email/campaigns] delete failed:', error)
    return NextResponse.json({ error: 'Impossible de supprimer cette campagne.' }, { status: 500 })
  }
}
