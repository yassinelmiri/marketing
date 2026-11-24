import { NextResponse, type NextRequest } from 'next/server'
import nodemailer from 'nodemailer'
import { randomUUID } from 'node:crypto'
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
      .select('id, smtp_account_id, liste_id, created_by, sender_email, sender_name, liste_nom, subject, message, recipients, failed_recipients, total_recipients, sent_count, failed_count, status, sent_at, created_at')
      .order('created_at', { ascending: false }).limit(100)
    if (Number(auth.profile.role_id) !== 1) query = query.eq('created_by', auth.profile.id)
    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ campaigns: data ?? [] })
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
    const unsubscribeEnabled = body.unsubscribe_enabled !== false
    const batchSize = Math.min(100, Math.max(1, Number(body.batch_size) || 25))
    const batchDelaySeconds = Math.min(60, Math.max(0, Number(body.batch_delay_seconds) || 0))
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
    const candidates = Array.from(new Set((contacts ?? [])
      .map((contact) => String(contact.email ?? '').trim().toLowerCase())
      .filter((email) => /^[^\s@]+@[^\s@]+\\.[^\s@]+$/.test(email))))
    const { data: suppressed, error: suppressionError } = await admin.from('email_unsubscribes').select('email').in('email', candidates)
    if (suppressionError) throw suppressionError
    const suppressedSet = new Set((suppressed ?? []).map((item) => String(item.email).toLowerCase()))
    const recipients = candidates.filter((email) => !suppressedSet.has(email))
    if (!recipients.length) return NextResponse.json({ error: 'Aucune adresse e-mail valide dans cette liste.' }, { status: 400 })
    if (recipients.length > 100) return NextResponse.json({ error: 'Limite de 100 destinataires par envoi. Divisez votre liste en plusieurs campagnes.' }, { status: 400 })

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
      tracking_opens: trackingOpens,
      tracking_clicks: trackingClicks,
      unsubscribe_enabled: unsubscribeEnabled,
      batch_size: batchSize,
      batch_delay_seconds: batchDelaySeconds,
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
    const baseUrl = request.nextUrl.origin
    const trackingRows = recipients.map((email) => ({ campaign_id: campaignId, email, tracking_token: randomUUID() }))
    const { error: trackingInsertError } = await admin.from('email_campaign_recipients').insert(trackingRows)
    if (trackingInsertError) throw trackingInsertError
    const tokenByEmail = new Map(trackingRows.map((row) => [row.email, row.tracking_token]))
    try {
      await transporter.verify()
      for (let index = 0; index < recipients.length; index += 1) {
        const recipient = recipients[index]
        const token = tokenByEmail.get(recipient)!
        try {
          const safeHtml = message
            .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
            .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
          const html = safeHtml
            .replace(/href=(['"])(https?:\/\/[^'"]+)\1/gi, (_match, quote, url) =>
              trackingClicks ? 'href=' + quote + baseUrl + '/api/email/track/click/' + token + '?url=' + encodeURIComponent(url) + quote : 'href=' + quote + url + quote)
            + (trackingOpens ? '<img src="' + baseUrl + '/api/email/track/open/' + token + '" width="1" height="1" alt="" style="display:none" />' : '')
            + (unsubscribeEnabled ? '<p style="font-size:12px;color:#64748b">Pour ne plus recevoir ces e-mails, <a href="' + baseUrl + '/api/email/unsubscribe/' + token + '">désabonnez-vous ici</a>.</p>' : '')
          await transporter.sendMail({
            from: { name: smtp.from_name || smtp.name, address: smtp.email },
            to: recipient,
            replyTo: replyTo || undefined,
            subject,
            text: message.replace(/<[^>]*>/g, ' '),
            html,
          })
          sent += 1
          await admin.from('email_campaign_recipients').update({ sent_at: new Date().toISOString() }).eq('campaign_id', campaignId).eq('email', recipient)
          if (batchDelaySeconds > 0 && (index + 1) % batchSize === 0 && index + 1 < recipients.length) {
            await new Promise((resolve) => setTimeout(resolve, batchDelaySeconds * 1000))
          }
        } catch (error) {
          console.error('[email/send] delivery failed:', error)
          failures.push(recipient)
        }
      }
    } finally {
      transporter.close()
    }

    const status = sent === recipients.length ? 'sent' : sent > 0 ? 'partial' : 'failed'
    const { error: updateError } = await admin.from('email_campaigns').update({
      sent_count: sent,
      failed_count: failures.length,
      failed_recipients: failures,
      sent_at: new Date().toISOString(),
      status,
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
