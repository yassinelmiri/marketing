import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function checkOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin) return NextResponse.json({ error: 'En-tête Origin manquant.' }, { status: 403 })
  try {
    if (new URL(origin).origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Origine invalide.' }, { status: 403 })
  }
  return null
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function PATCH(request: NextRequest) {
  const originError = checkOrigin(request)
  if (originError) return originError

  const session = await createClient()
  const { data: authData, error: authError } = await session.auth.getUser()
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Session expirée. Reconnectez-vous.' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const prenom = clean(body.prenom, 80)
  const nom = clean(body.nom, 80)
  const email = clean(body.email, 254).toLowerCase()
  const telephone = clean(body.telephone, 40)
  const address = clean(body.address, 240)
  const password = typeof body.password === 'string' ? body.password : ''

  if (!prenom || !nom || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Prénom, nom et adresse e-mail valides obligatoires.' }, { status: 400 })
  }
  if (password && (password.length < 12 || password.length > 128)) {
    return NextResponse.json({ error: 'Le mot de passe doit contenir entre 12 et 128 caractères.' }, { status: 400 })
  }

  const { data: profile, error: profileError } = await session
    .from('user_profiles')
    .select('id, auth_user_id, email')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profil utilisateur introuvable.' }, { status: 404 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Configuration serveur manquante: SUPABASE_SERVICE_ROLE_KEY.' }, { status: 503 })
  }

  const emailChanged = email !== (profile.email ?? '').toLowerCase()
  if (emailChanged || password) {
    const authUpdates: { email?: string; email_confirm?: boolean; password?: string } = {}
    if (emailChanged) {
      authUpdates.email = email
      authUpdates.email_confirm = true
    }
    if (password) authUpdates.password = password

    const { error: authUpdateError } = await admin.auth.admin.updateUserById(authData.user.id, authUpdates)
    if (authUpdateError) {
      return NextResponse.json({ error: authUpdateError.message || 'Mise à jour du compte sécurisé impossible.' }, { status: 400 })
    }
  }

  const { error: updateError } = await admin
    .from('user_profiles')
    .update({ prenom, nom, email, telephone: telephone || null, address: address || null })
    .eq('id', Number(profile.id))

  if (updateError) {
    console.error('[profile] update failed:', updateError.message)
    return NextResponse.json({ error: 'Le compte sécurisé a été mis à jour, mais le profil applicatif n’a pas pu être enregistré. Contactez un administrateur.' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: 'Profil mis à jour avec succès.',
    user: { prenom, nom, email, telephone, address },
  })
}
