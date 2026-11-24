import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import nodemailer from 'nodemailer'
import { encryptSmtpPassword, decryptSmtpPassword } from '@/lib/supabase/smtp-crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function access() {
  const session = await createClient()
  const { data: auth, error: authError } = await session.auth.getUser()
  if (authError || !auth.user) return { response: NextResponse.json({ error: 'Authentification requise.' }, { status: 401 }) }
  const { data: profile, error } = await session.from('user_profiles').select('id, role_id').eq('auth_user_id', auth.user.id).maybeSingle()
  if (error || !profile) return { response: NextResponse.json({ error: 'Profil utilisateur introuvable.' }, { status: 403 }) }
  const isAdmin = Number(profile.role_id) === 1
  const { data: allowed, error: permissionError } = await session.rpc('has_permission', { permission_code: 'email.access' })
  if (permissionError || (!isAdmin && !allowed)) return { response: NextResponse.json({ error: 'Accès au module E-mail refusé.' }, { status: 403 }) }
  return { session, profile, isAdmin }
}

function originError(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin) return NextResponse.json({ error: 'Origine manquante.' }, { status: 403 })
  try {
    if (new URL(origin).origin !== request.nextUrl.origin) return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403 })
  } catch { return NextResponse.json({ error: 'Origine invalide.' }, { status: 403 }) }
  return null
}

export async function GET() {
  try {
    const auth = await access()
    if ('response' in auth) return auth.response
    const admin = createAdminClient()
    const { data, error } = await admin.from('smtp_accounts')
      .select('id, name, email, host, port, secure, username, from_name, is_active, created_at')
      .order('created_at', { ascending: false })
    if (error) throw error
    const safeAccounts = (data ?? []).map((account) => auth.isAdmin ? account : { id: account.id, name: account.name, email: account.email, from_name: account.from_name, is_active: account.is_active, created_at: account.created_at })
    return NextResponse.json({ accounts: safeAccounts, isAdmin: auth.isAdmin }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[smtp] GET failed:', error)
    return NextResponse.json({ error: 'Impossible de charger les comptes SMTP. Vérifiez la migration SQL et SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const origin = originError(request)
  if (origin) return origin
  try {
    const auth = await access()
    if ('response' in auth) return auth.response
    if (!auth.isAdmin) return NextResponse.json({ error: 'Seul un administrateur peut gérer les comptes SMTP.' }, { status: 403 })
    const body = await request.json()
    if (body.action === 'test') {
      const id = Number(body.id)
      if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: 'Identifiant SMTP invalide.' }, { status: 400 })
      const admin = createAdminClient()
      const { data: account, error: accountError } = await admin.from('smtp_accounts')
        .select('host, port, secure, username, password_encrypted')
        .eq('id', id).maybeSingle()
      if (accountError || !account) return NextResponse.json({ error: 'Compte SMTP introuvable.' }, { status: 404 })
      const transporter = nodemailer.createTransport({
        host: account.host,
        port: Number(account.port),
        secure: Boolean(account.secure),
        auth: { user: account.username, pass: decryptSmtpPassword(account.password_encrypted) },
        connectionTimeout: 12000,
        greetingTimeout: 12000,
        socketTimeout: 15000,
      })
      try {
        await transporter.verify()
        return NextResponse.json({ success: true, message: 'Connexion SMTP vérifiée avec succès.' })
      } catch (error) {
        console.error('[smtp] test failed:', error)
        return NextResponse.json({ error: 'Connexion SMTP impossible. Vérifiez le serveur, le port et les identifiants.' }, { status: 400 })
      } finally {
        transporter.close()
      }
    }
    const name = String(body.name ?? '').trim().slice(0, 100)
    const email = String(body.email ?? '').trim().toLowerCase()
    const host = String(body.host ?? '').trim().slice(0, 255)
    const port = Number(body.port ?? 587)
    const username = String(body.username ?? '').trim().slice(0, 254)
    const password = String(body.password ?? '')
    const fromName = String(body.from_name ?? '').trim().slice(0, 120)
    const secure = Boolean(body.secure)
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !host || !username || !password || !Number.isInteger(port) || port < 1 || port > 65535) {
      return NextResponse.json({ error: 'Vérifiez le nom, l’adresse e-mail, le serveur SMTP, le port, identifiant et mot de passe.' }, { status: 400 })
    }
    const admin = createAdminClient()
    const { data, error } = await admin.from('smtp_accounts').insert({
      name, email, host, port, secure, username,
      password_encrypted: encryptSmtpPassword(password),
      from_name: fromName || null,
      created_by: Number(auth.profile.id),
    }).select('id, name, email, host, port, secure, username, from_name, is_active, created_at').single()
    if (error) throw error
    return NextResponse.json({ account: data }, { status: 201 })
  } catch (error) {
    console.error('[smtp] POST failed:', error)
    return NextResponse.json({ error: 'Création du compte SMTP impossible. Vérifiez SMTP_ENCRYPTION_KEY et la migration SQL.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const origin = originError(request)
  if (origin) return origin
  try {
    const auth = await access()
    if ('response' in auth) return auth.response
    if (!auth.isAdmin) return NextResponse.json({ error: 'Accès administrateur requis.' }, { status: 403 })
    const body = await request.json()
    const id = Number(body.id)
    if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 })
    const update: Record<string, unknown> = {}
    for (const key of ['name', 'email', 'host', 'username', 'from_name'] as const) {
      if (typeof body[key] === 'string') update[key] = body[key].trim()
    }
    if (typeof body.port === 'number') update.port = body.port
    if (typeof body.secure === 'boolean') update.secure = body.secure
    if (typeof body.is_active === 'boolean') update.is_active = body.is_active
    if (typeof body.password === 'string' && body.password.length) update.password_encrypted = encryptSmtpPassword(body.password)
    update.updated_at = new Date().toISOString()
    const admin = createAdminClient()
    const { data, error } = await admin.from('smtp_accounts').update(update).eq('id', id)
      .select('id, name, email, host, port, secure, username, from_name, is_active, created_at').single()
    if (error) throw error
    return NextResponse.json({ account: data })
  } catch (error) {
    console.error('[smtp] PATCH failed:', error)
    return NextResponse.json({ error: 'Modification du compte SMTP impossible.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const origin = originError(request)
  if (origin) return origin
  try {
    const auth = await access()
    if ('response' in auth) return auth.response
    if (!auth.isAdmin) return NextResponse.json({ error: 'Accès administrateur requis.' }, { status: 403 })
    const body = await request.json()
    const id = Number(body.id)
    if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 })
    const admin = createAdminClient()
    const { error } = await admin.from('smtp_accounts').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[smtp] DELETE failed:', error)
    return NextResponse.json({ error: 'Suppression du compte SMTP impossible.' }, { status: 500 })
  }
}
