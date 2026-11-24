import { NextResponse, type NextRequest } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptSmtpPassword } from '@/lib/supabase/smtp-crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function originError(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin) return NextResponse.json({ error: 'Origine manquante.' }, { status: 403 })
  try {
    if (new URL(origin).origin !== request.nextUrl.origin) return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403 })
  } catch { return NextResponse.json({ error: 'Origine invalide.' }, { status: 403 }) }
  return null
}

async function authorizedSession() {
  const session = await createClient()
  const { data: auth, error: authError } = await session.auth.getUser()
  if (authError || !auth.user) return { error: NextResponse.json({ error: 'Authentification requise.' }, { status: 401 }) }
  const { data: profile, error: profileError } = await session.from('user_profiles')
    .select('id, role_id').eq('auth_user_id', auth.user.id).maybeSingle()
  if (profileError || !profile) return { error: NextResponse.json({ error: 'Profil utilisateur introuvable.' }, { status: 403 }) }
  const isAdmin = Number(profile.role_id) === 1
  const { data: allowed, error: permissionError } = await session.rpc('has_permission', { permission_code: 'email.access' })
  if (permissionError || (!isAdmin && !allowed)) return { error: NextResponse.json({ error: 'Vous ne disposez pas de l’autorisation d’accès au module e-mail.' }, { status: 403 }) }
  return { session, profile, user: auth.user }
}

export async function GET(request: NextRequest) {
  const auth = await authorizedSession()
  if ('error' in auth) return auth.error
  try {
    const admin = createAdminClient()
    let query = admin.from('email_campaigns')
      .select('id, smtp_account_id, liste_id, created_by, sender_email, sender_name, liste_nom, subject, total_recipients, sent_count, failed_count, recipient_offset, scheduled_at, next_batch_at, status, sent_at, created_at')
      .order('created_at', { ascending: false }).limit(100)
    if (Number(auth.profile.role_id) !== 1) query = query.eq('created_by', auth.profile.id)
    const { data, error } = await query
    if (error) throw error
    const ids = (data ?? []).map((item) => Number(item.id))
    const { data: events, error: eventsError } = ids.length ? await admin.from('email_campaign_events').select('campaign_id,recipient_email,event_type').in('campaign_id', ids) : { data: [], error: null }
    if (eventsError) throw eventsError
    const counts = new Map<number, { opens: Set<string>; clicks: Set<string> }>()
    for (const event of events ?? []) {
      const id = Number(event.campaign_id)
      const value = counts.get(id) ?? { opens: new Set<string>(), clicks: new Set<string>() }
      const recipient = String(event.recipient_email ?? '').toLowerCase()
      if (recipient && event.event_type === 'open') value.opens.add(recipient)
      if (recipient && event.event_type === 'click') value.clicks.add(recipient)
      counts.set(id, value)
    }
    return NextResponse.json({ campaigns: (data ?? []).map((item) => ({ ...item, open_count: counts.get(Number(item.id))?.opens.size ?? 0, click_count: counts.get(Number(item.id))?.clicks.size ?? 0 })) })
  } catch (error) {
    console.error('[email/history] failed:', error)
    return NextResponse.json({ error: 'Impossible de charger l’historique des e-mails.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const origin = originError(request)
  if (origin) return origin

  let campaignId: number | null = null
  const admin = createAdminClient()
  try {
    const auth = await authorizedSession()
    if ('error' in auth) return auth.error

    const body = await request.json()
    const smtpId = Number(body.smtp_account_id)
    const listeId = Number(body.liste_id)
    const subject = String(body.subject ?? '').trim().slice(0, 250)
    const message = String(body.message ?? '').trim().slice(0, 50000)
    const replyTo = String(body.reply_to ?? '').trim().slice(0, 254)
    const trackingOpens = body.tracking_opens !== false
    const trackingClicks = body.tracking_clicks !== false
    const batchSize = Math.min(100, Math.max(1, Number(body.batch_size) || 50))
    const batchDelay = Math.min(3600, Math.max(0, Number(body.batch_delay_seconds) || 0))
    const templateId = body.template_id ? Number(body.template_id) : null
    if (!Number.isInteger(smtpId) || smtpId < 1 || !Number.isInteger(listeId) || listeId < 1 || !subject || !message) {
      return NextResponse.json({ error: 'Choisissez un compte SMTP, une liste, un objet et un message.' }, { status: 400 })
    }

    const { data: smtp, error: smtpError } = await admin.from('smtp_accounts')
      .select('id, name, email, host, port, secure, username, password_encrypted, from_name, is_active')
      .eq('id', smtpId).eq('is_active', true).maybeSingle()
    if (smtpError || !smtp) return NextResponse.json({ error: 'Compte SMTP introuvable ou désactivé.' }, { status: 404 })

    const { data: liste, error: listeError } = await admin.from('listes')
      .select('id, nom').eq('id', listeId).maybeSingle()
    if (listeError || !liste) return NextResponse.json({ error: 'Liste introuvable.' }, { status: 404 })

    const { data: links, error: linksError } = await admin.from('liste_contacts')
      .select('contact_id').eq('liste_id', listeId)
    if (linksError) throw linksError
    const contactIds = Array.from(new Set((links ?? []).map((item) => Number(item.contact_id)).filter(Number.isFinite)))
    if (!contactIds.length) return NextResponse.json({ error: 'Cette liste ne contient aucun contact.' }, { status: 400 })

    const { data: contacts, error: contactsError } = await admin.from('contacts')
      .select('email').in('id', contactIds)
    if (contactsError) throw contactsError
    let recipients = Array.from(new Set((contacts ?? [])
      .map((contact) => String(contact.email ?? '').trim().toLowerCase())
      .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))))
    if (!recipients.length) return NextResponse.json({ error: 'Aucune adresse e-mail valide dans cette liste.' }, { status: 400 })
    const { data: suppressed, error: suppressedError } = await admin.from('email_unsubscribes').select('email')
    if (suppressedError) throw suppressedError
    const excluded = new Set((suppressed ?? []).map((item) => String(item.email).toLowerCase()))
    recipients = recipients.filter((email) => !excluded.has(email))
    if (!recipients.length) return NextResponse.json({ error: 'Tous les destinataires sont désabonnés ou exclus.' }, { status: 400 })
    if (recipients.length > 5000) return NextResponse.json({ error: 'Limite de 5 000 destinataires par campagne. Divisez votre liste en plusieurs campagnes.' }, { status: 400 })

    const { data: campaign, error: insertError } = await admin.from('email_campaigns').insert({
      smtp_account_id: smtp.id,
      liste_id: liste.id,
      created_by: auth.profile.id,
      sender_email: smtp.email,
      sender_name: smtp.from_name || smtp.name,
      liste_nom: liste.nom,
      subject,
      message,
      reply_to: replyTo || null,
      template_id: templateId,
      tracking_opens: trackingOpens,
      tracking_clicks: trackingClicks,
      batch_size: batchSize,
      batch_delay_seconds: batchDelay,
      recipients,
      total_recipients: recipients.length,
      status: 'pending',
    }).select('id').single()
    if (insertError) throw insertError
    campaignId = Number(campaign.id)

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: Number(smtp.port),
      secure: Boolean(smtp.secure),
      auth: { user: smtp.username, pass: decryptSmtpPassword(smtp.password_encrypted) },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    })

    let sent = 0
    const failures: string[] = []
    try {
      await transporter.verify()
      for (let offset = 0; offset < recipients.length; offset += batchSize) {
        const batch = recipients.slice(offset, offset + batchSize)
        for (const recipient of batch) {
          try {
            const pixel = trackingOpens ? '<img src="' + request.nextUrl.origin + '/api/email/track/open?campaign=' + campaignId + '&email=' + encodeURIComponent(recipient) + '" width="1" height="1" alt="" style="display:none" />' : ''
            const { data: unsubscribeToken, error: tokenError } = await admin.from('email_unsubscribe_tokens').upsert({ email: recipient, campaign_id: campaignId }, { onConflict: 'email,campaign_id' }).select('token').single()
            if (tokenError) throw tokenError
            const unsubscribeLink = request.nextUrl.origin + '/api/email/unsubscribe/' + unsubscribeToken.token
            let html = /<[a-z][\s\S]*?>/i.test(message) ? message : message.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] ?? ch)).replace(/\n/g, '<br>')
            if (trackingClicks) html = html.replace(/href=[\"'](https?:\/\/[^\"']+)[\"']/gi, (_match, url) => 'href="' + request.nextUrl.origin + '/api/email/track/click?campaign=' + campaignId + '&email=' + encodeURIComponent(recipient) + '&url=' + encodeURIComponent(url) + '"')
            await transporter.sendMail({
              from: { name: smtp.from_name || smtp.name, address: smtp.email },
              to: recipient,
              ...(replyTo ? { replyTo } : {}),
              subject,
              headers: {
                'List-Unsubscribe': '<' + unsubscribeLink + '>',
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              },
              html: '<div>' + html + '</div>' + '<p style="font-size:12px;color:#666;margin-top:24px"><a href="' + unsubscribeLink + '">Se désabonner</a></p>' + pixel,
              text: message.replace(/<[^>]*>/g, ' ') + '\n\nSe désabonner : ' + unsubscribeLink,
            })
            sent += 1
          } catch (error) { console.error('[email/send] delivery failed:', error); failures.push(recipient) }
        }
        if (offset + batchSize < recipients.length && batchDelay > 0) await new Promise((resolve) => setTimeout(resolve, batchDelay * 1000))
      }
    } finally {
      transporter.close()
    }

    const status = sent === recipients.length ? 'sent' : sent > 0 ? 'partial' : 'failed'
    const { error: updateError } = await admin.from('email_campaigns').update({
      sent_count: sent,
      failed_count: failures.length,
      failed_recipients: failures,
      status,
      sent_at: new Date().toISOString(),
    }).eq('id', campaignId)
    if (updateError) throw updateError

    return NextResponse.json({
      success: true,
      campaignId,
      sender: smtp.email,
      total: recipients.length,
      sent,
      failed: failures.length,
      failedRecipients: failures.slice(0, 20),
      message: `Envoi terminé : ${sent}/${recipients.length} e-mail(s) envoyé(s). Historique enregistré.`,
    })
  } catch (error) {
    console.error('[email/send] failed:', error)
    if (campaignId !== null) {
      await admin.from('email_campaigns').update({ status: 'failed' }).eq('id', campaignId)
    }
    const message = error instanceof Error ? error.message : ''
    const safeMessage = /Invalid login|authentication|credentials/i.test(message)
      ? 'Authentification SMTP refusée. Vérifiez l’adresse et le mot de passe SMTP.'
      : 'Échec de l’envoi. Vérifiez les paramètres SMTP et réessayez.'
    return NextResponse.json({ error: safeMessage }, { status: 500 })
  }
}
