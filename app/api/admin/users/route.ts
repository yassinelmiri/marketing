import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ADMIN_ROLE_ID = 1
const ROOT_EMAIL = 'miriyassine123@gmail.com'

async function requireAdmin() {
  const session = await createClient()
  const { data: authData, error: authError } = await session.auth.getUser()
  if (authError || !authData.user) {
    return { response: NextResponse.json({ error: 'Authentification requise.' }, { status: 401 }) }
  }

  const { data: profile, error } = await session
    .from('user_profiles')
    .select('id, role_id, email')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle()

  if (error || !profile || Number(profile.role_id) !== ADMIN_ROLE_ID) {
    return { response: NextResponse.json({ error: 'Accès administrateur requis.' }, { status: 403 }) }
  }

  return { profile, admin: createAdminClient() }
}

function checkRequestOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403 })
  }
  return null
}

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function POST(request: NextRequest) {
  const originError = checkRequestOrigin(request)
  if (originError) return originError
  const access = await requireAdmin()
  if ('response' in access) return access.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const prenom = text(body.prenom, 80)
  const nom = text(body.nom, 80)
  const email = text(body.email, 254).toLowerCase()
  const telephone = text(body.telephone, 40)
  const address = text(body.address, 240)
  const password = typeof body.password === 'string' ? body.password : ''
  const roleId = Number(body.role_id ?? 3)

  if (!prenom || !nom || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Prénom, nom et e-mail valides obligatoires.' }, { status: 400 })
  }
  if (password.length < 12 || password.length > 128) {
    return NextResponse.json({ error: 'Mot de passe: 12 caractères minimum.' }, { status: 400 })
  }
  if (!Number.isInteger(roleId) || roleId <= ADMIN_ROLE_ID) {
    return NextResponse.json({ error: 'Rôle non autorisé.' }, { status: 400 })
  }

  const { data: role } = await access.admin.from('roles').select('id').eq('id', roleId).maybeSingle()
  if (!role) return NextResponse.json({ error: 'Rôle inconnu.' }, { status: 400 })

  const { data, error } = await access.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { full_name: prenom + ' ' + nom },
  })
  if (error || !data.user) {
    return NextResponse.json({ error: error?.message ?? 'Création impossible.' }, { status: 400 })
  }

  const { data: profile, error: profileError } = await access.admin
    .from('user_profiles')
    .update({ prenom, nom, email, telephone: telephone || null, address: address || null, role_id: roleId })
    .eq('auth_user_id', data.user.id)
    .select('id, prenom, nom, email, telephone, address, role_id, date_creation')
    .single()

  if (profileError || !profile) {
    await access.admin.auth.admin.deleteUser(data.user.id)
    return NextResponse.json({ error: 'Profil non créé; compte annulé.' }, { status: 500 })
  }

  return NextResponse.json({ user: profile }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const originError = checkRequestOrigin(request)
  if (originError) return originError
  const access = await requireAdmin()
  if ('response' in access) return access.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const id = Number(body.id)
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 })
  }

  const { data: target } = await access.admin
    .from('user_profiles')
    .select('id, auth_user_id, email, role_id')
    .eq('id', id)
    .maybeSingle()

  if (!target?.auth_user_id) return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 })
  if (target.email?.toLowerCase() === ROOT_EMAIL) {
    return NextResponse.json({ error: 'Administrateur principal protégé.' }, { status: 403 })
  }

  const prenom = text(body.prenom, 80)
  const nom = text(body.nom, 80)
  const telephone = text(body.telephone, 40)
  const address = text(body.address, 240)
  const roleId = Number(body.role_id ?? target.role_id)
  const password = typeof body.password === 'string' ? body.password : ''

  if (!prenom || !nom || !Number.isInteger(roleId) || roleId <= ADMIN_ROLE_ID) {
    return NextResponse.json({ error: 'Données ou rôle invalides.' }, { status: 400 })
  }
  if (password && (password.length < 12 || password.length > 128)) {
    return NextResponse.json({ error: 'Mot de passe: 12 à 128 caractères requis.' }, { status: 400 })
  }

  const { data: role } = await access.admin.from('roles').select('id').eq('id', roleId).maybeSingle()
  if (!role) return NextResponse.json({ error: 'Rôle inconnu.' }, { status: 400 })

  // Valider toutes les entrées avant toute écriture pour éviter une mise à jour partielle.
  if (password) {
    const { error: passwordError } = await access.admin.auth.admin.updateUserById(
      target.auth_user_id,
      { password },
    )
    if (passwordError) return NextResponse.json({ error: 'Mot de passe non modifié.' }, { status: 400 })
  }

  const { error } = await access.admin.from('user_profiles')
    .update({ prenom, nom, telephone: telephone || null, address: address || null, role_id: roleId })
    .eq('id', id)
  if (error) return NextResponse.json({ error: 'Mise à jour du profil impossible.' }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const originError = checkRequestOrigin(request)
  if (originError) return originError
  const access = await requireAdmin()
  if ('response' in access) return access.response

  let body: { id?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const id = Number(body.id)
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 })
  }
  if (id === Number(access.profile.id)) {
    return NextResponse.json({ error: 'Impossible de supprimer votre propre compte.' }, { status: 403 })
  }

  const { data: target } = await access.admin
    .from('user_profiles')
    .select('auth_user_id, email')
    .eq('id', id)
    .maybeSingle()
  if (!target?.auth_user_id) return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 })
  if (target.email?.toLowerCase() === ROOT_EMAIL) {
    return NextResponse.json({ error: 'Administrateur principal protégé.' }, { status: 403 })
  }

  const { error } = await access.admin.auth.admin.deleteUser(target.auth_user_id)
  if (error) return NextResponse.json({ error: 'Suppression impossible.' }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function GET() {
  const access = await requireAdmin()
  if ('response' in access) return access.response

  const [{ data: users, error: usersError }, { data: roles, error: rolesError }] = await Promise.all([
    access.admin.from('user_profiles')
      .select('id, prenom, nom, email, telephone, address, role_id, date_creation')
      .order('date_creation', { ascending: false }),
    access.admin.from('roles').select('id, nom, description').order('id'),
  ])

  if (usersError || rolesError) {
    return NextResponse.json({ error: 'Chargement des utilisateurs impossible.' }, { status: 500 })
  }

  return NextResponse.json({ users: users ?? [], roles: roles ?? [] })
}
