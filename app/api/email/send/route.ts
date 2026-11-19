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

export async function POST(request: NextRequest) {
  const origin = originError(request)
  if (origin) return origin

  try {
    const session = await createClient()
    const { data: auth, error: authError } = await session.auth.getUser()
    if (authError || !auth.user) return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 })

    const { data: profile, error: profileError } = await session.from('user_profiles')
      .select('id, role_id').eq('auth_user_id', auth.user.id).maybeSingle()
    if (profileError || !profile) return NextResponse.json({ error: 'Profil utilisateur introuvable.' }, { status: 403 })

    const isAdmin = Number(profile.role_id) === 1
    const { data: allowed, error: permissionError } = await session.rpc('has_permission', { permission_code: 'email.access' })
    if (permissionError || (!isAdmin && !allowed)) return NextResponse.json({ error: 'Vous ne disposez pas de l’autorisation d’envoi e-mail.' }, { status: 403 })

    const body = await request.json()
    const smtpId = Number(body.smtp_account_id)
    const listeId = Number(body.liste_id)
    const subject = String(body.subject ?? '').trim().slice(0, 250)
    const message = String(body.message ?? '').trim().slice(0, 50000)
    if (!Number.isInteger(smtpId) || smtpId < 1 || !Number.isInteger(listeId) || listeId < 1 || !subject || !message) {
      return NextResponse.json({ error: 'Choisissez un compte SMTP, une liste, un objet et un message.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: smtp, error: smtpError } = await admin.from('smtp_accounts')
      .select('id, name, email, host, port, secure, username, password_encrypted, from_name, is_active')
      .eq('id', smtpId).eq('is_active', true).maybeSingle()
    if (smtpError || !smtp) return NextResponse.json({ error: 'Compte SMTP introuvable ou désactivé.' }, { status: 404 })

    const { data: links, error: linksError } = await admin.from('liste_contacts')
      .select('contact_id').eq('liste_id', listeId)
    if (linksError) throw linksError
    const contactIds = Array.from(new Set((links ?? []).map((item) => Number(item.contact_id)).filter(Number.isFinite)))
    if (!contactIds.length) return NextResponse.json({ error: 'Cette liste ne contient aucun contact.' }, { status: 400 })

    const { data: contacts, error: contactsError } = await admin.from('contacts')
      .select('email, prenom, nom').in('id', contactIds)
    if (contactsError) throw contactsError
    const recipients = Array.from(new Set((contacts ?? [])
      .map((contact) => String(contact.email ?? '').trim().toLowerCase())
      .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))))
    if (!recipients.length) return NextResponse.json({ error: 'Aucune adresse e-mail valide dans cette liste.' }, { status: 400 })
    if (recipients.length > 100) return NextResponse.json({ error: 'Limite de 100 destinataires par envoi. Divisez votre liste en plusieurs campagnes.' }, { status: 400 })

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: Number(smtp.port),
      secure: Boolean(smtp.secure),
      auth: { user: smtp.username, pass: decryptSmtpPassword(smtp.password_encrypted) },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    })

    await transporter.verify()
    let sent = 0
    const failures: string[] = []
    for (const recipient of recipients) {
      try {
        await transporter.sendMail({
          from: { name: smtp.from_name || smtp.name, address: smtp.email },
          to: recipient,
          subject,
          text: message,
        })
        sent += 1
      } catch (error) {
        console.error('[email/send] recipient delivery failed:', recipient, error)
        failures.push(recipient)
      }
    }
    transporter.close()

    return NextResponse.json({
      success: true,
      sender: smtp.email,
      total: recipients.length,
      sent,
      failed: failures.length,
      failedRecipients: failures.slice(0, 20),
      message: `Envoi terminé : ${sent}/${recipients.length} e-mail(s) envoyé(s).`,
    })
  } catch (error) {
    console.error('[email/send] failed:', error)
    const message = error instanceof Error ? error.message : ''
    const safeMessage = /Invalid login|authentication|credentials/i.test(message)
      ? 'Authentification SMTP refusée. Vérifiez l’adresse et le mot de passe SMTP.'
      : 'Échec de l’envoi. Vérifiez les paramètres SMTP et réessayez.'
    return NextResponse.json({ error: safeMessage }, { status: 500 })
  }
}
