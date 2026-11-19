import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ADMIN_ROLE_ID = 1
const ROOT_EMAIL = 'miriyassine123@gmail.com'

type AdminAccess = {
  session: Awaited<ReturnType<typeof createClient>>
  profile: { id: number; role_id: number; email: string | null }
}

async function requireAdmin(): Promise<
  | { access: AdminAccess }
  | { response: NextResponse }
> {
  const session = await createClient()
  const { data: authData, error: authError } = await session.auth.getUser()

  if (authError || !authData.user) {
    return { response: NextResponse.json({ error: 'Authentification requise. Reconnectez-vous.' }, { status: 401 }) }
  }

  const { data: profile, error } = await session
    .from('user_profiles')
    .select('id, role_id, email')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle()

  if (error) {
    console.error('[admin/users] profile check failed:', error.message)
    return { response: NextResponse.json({ error: 'Impossible de vérifier votre rôle administrateur.' }, { status: 500 }) }
  }

  if (!profile || Number(profile.role_id) !== ADMIN_ROLE_ID) {
    return { response: NextResponse.json({ error: 'Accès administrateur requis.' }, { status: 403 }) }
  }

  return {
    access: {
      session,
      profile: {
        id: Number(profile.id),
        role_id: Number(profile.role_id),
        email: profile.email ?? null,
      },
    },
  }
}

function getAdminClientOrNull() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null

  try {
    return createAdminClient()
  } catch (error) {
    console.error('[admin/users] admin client configuration failed:', error)
    return null
  }
}

function checkRequestOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin) {
    return NextResponse.json({ error: 'En-tête Origin manquant.' }, { status: 403 })
  }

  try {
    if (new URL(origin).origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Origine invalide.' }, { status: 403 })
  }

  return null
}

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function serviceRoleRequired() {
  return NextResponse.json(
    { error: 'Configuration serveur manquante: ajoutez SUPABASE_SERVICE_ROLE_KEY dans les variables d’environnement du serveur, puis redémarrez/redéployez.' },
    { status: 503 },
  )
}

export async function GET() {
  try {
    const result = await requireAdmin()
    if ('response' in result) return result.response

    // La liste complète des comptes nécessite le client serveur privilégié.
    // Ne jamais renvoyer silencieusement uniquement le profil courant.
    const admin = getAdminClientOrNull()
    if (!admin) return serviceRoleRequired()

    const [{ data: users, error: usersError }, { data: roles, error: rolesError }] = await Promise.all([
      admin.from('user_profiles')
        .select('id, prenom, nom, email, telephone, address, role_id, date_creation')
        .order('date_creation', { ascending: false }),
      admin.from('roles').select('id, nom, description').order('id'),
    ])

    if (usersError || rolesError) {
      console.error('[admin/users] list query failed:', usersError?.message, rolesError?.message)
      return NextResponse.json(
        { error: 'Impossible de charger les utilisateurs. Vérifiez les tables user_profiles et roles.' },
        { status: 500 },
      )
    }

    return NextResponse.json(
      { users: users ?? [], roles: roles ?? [] },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  } catch (error) {
    console.error('[admin/users] GET failed:', error)
    return NextResponse.json({ error: 'Erreur serveur pendant le chargement des utilisateurs.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const originError = checkRequestOrigin(request)
  if (originError) return originError

  const result = await requireAdmin()
  if ('response' in result) return result.response

  const admin = getAdminClientOrNull()
  if (!admin) return serviceRoleRequired()

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
    return NextResponse.json({ error: 'Mot de passe: 12 à 128 caractères requis.' }, { status: 400 })
  }
  if (!Number.isSafeInteger(roleId) || roleId <= ADMIN_ROLE_ID) {
    return NextResponse.json({ error: 'Rôle non autorisé.' }, { status: 400 })
  }

  const { data: role, error: roleError } = await admin
    .from('roles')
    .select('id')
    .eq('id', roleId)
    .maybeSingle()

  if (roleError || !role) {
    return NextResponse.json({ error: 'Rôle inconnu ou inaccessible.' }, { status: 400 })
  }

  const { data: authResult, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `${prenom} ${nom}` },
  })

  if (authError || !authResult.user) {
    return NextResponse.json({ error: authError?.message ?? 'Création du compte Auth impossible.' }, { status: 400 })
  }

  // Upsert explicite: ne dépend pas du trigger handle_new_user.
  // Si le trigger a déjà créé le profil, la ligne existante est mise à jour.
  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .upsert({
      auth_user_id: authResult.user.id,
      prenom,
      nom,
      email,
      telephone: telephone || null,
      address: address || null,
      role_id: roleId,
    }, { onConflict: 'auth_user_id' })
    .select('id, prenom, nom, email, telephone, address, role_id, date_creation')
    .single()

  if (profileError || !profile) {
    console.error('[admin/users] profile upsert failed:', profileError?.message)
    await admin.auth.admin.deleteUser(authResult.user.id)
    return NextResponse.json(
      { error: 'Le compte Auth a été annulé car son profil applicatif n’a pas pu être créé. Vérifiez auth_user_id et le trigger Supabase.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ user: profile }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const originError = checkRequestOrigin(request)
  if (originError) return originError

  const result = await requireAdmin()
  if ('response' in result) return result.response

  const admin = getAdminClientOrNull()
  if (!admin) return serviceRoleRequired()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const id = Number(body.id)
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Identifiant utilisateur invalide.' }, { status: 400 })
  }

  const { data: target, error: targetError } = await admin
    .from('user_profiles')
    .select('id, auth_user_id, email, role_id')
    .eq('id', id)
    .maybeSingle()

  if (targetError || !target?.auth_user_id) {
    return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 })
  }
  if (target.email?.toLowerCase() === ROOT_EMAIL) {
    return NextResponse.json({ error: 'Administrateur principal protégé.' }, { status: 403 })
  }

  const prenom = text(body.prenom, 80)
  const nom = text(body.nom, 80)
  const email = text(body.email, 254).toLowerCase()
  const telephone = text(body.telephone, 40)
  const address = text(body.address, 240)
  const roleId = Number(body.role_id ?? target.role_id)
  const password = typeof body.password === 'string' ? body.password : ''

  if (!prenom || !nom || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Number.isSafeInteger(roleId) || roleId <= ADMIN_ROLE_ID) {
    return NextResponse.json({ error: 'Prénom, nom, e-mail ou rôle invalide.' }, { status: 400 })
  }
  if (password && (password.length < 12 || password.length > 128)) {
    return NextResponse.json({ error: 'Mot de passe: 12 à 128 caractères requis.' }, { status: 400 })
  }

  const { data: role, error: roleError } = await admin.from('roles').select('id').eq('id', roleId).maybeSingle()
  if (roleError || !role) {
    return NextResponse.json({ error: 'Rôle inconnu ou inaccessible.' }, { status: 400 })
  }

  const emailChanged = email !== (target.email ?? '').toLowerCase()
  if (emailChanged) {
    const { error: emailError } = await admin.auth.admin.updateUserById(target.auth_user_id, {
      email,
      email_confirm: true,
    })
    if (emailError) {
      return NextResponse.json({ error: emailError.message || 'Modification de l’e-mail impossible.' }, { status: 400 })
    }
  }

  const { error: profileError } = await admin
    .from('user_profiles')
    .update({ prenom, nom, email, telephone: telephone || null, address: address || null, role_id: roleId })
    .eq('id', id)

  if (profileError) {
    console.error('[admin/users] profile update failed:', profileError.message)
    if (emailChanged && target.email) {
      await admin.auth.admin.updateUserById(target.auth_user_id, { email: target.email, email_confirm: true })
    }
    return NextResponse.json({ error: 'Modification du profil impossible.' }, { status: 500 })
  }

  if (password) {
    const { error: passwordError } = await admin.auth.admin.updateUserById(target.auth_user_id, { password })
    if (passwordError) {
      return NextResponse.json({ error: 'Profil modifié, mais le mot de passe n’a pas pu être changé.' }, { status: 400 })
    }
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const originError = checkRequestOrigin(request)
  if (originError) return originError

  const result = await requireAdmin()
  if ('response' in result) return result.response

  const admin = getAdminClientOrNull()
  if (!admin) return serviceRoleRequired()

  let body: { id?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const id = Number(body.id)
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Identifiant utilisateur invalide.' }, { status: 400 })
  }
  if (id === result.access.profile.id) {
    return NextResponse.json({ error: 'Impossible de supprimer votre propre compte.' }, { status: 403 })
  }

  const { data: target, error: targetError } = await admin
    .from('user_profiles')
    .select('auth_user_id, email')
    .eq('id', id)
    .maybeSingle()

  if (targetError || !target?.auth_user_id) {
    return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 })
  }
  if (target.email?.toLowerCase() === ROOT_EMAIL) {
    return NextResponse.json({ error: 'Administrateur principal protégé.' }, { status: 403 })
  }

  const { error } = await admin.auth.admin.deleteUser(target.auth_user_id)
  if (error) {
    console.error('[admin/users] auth delete failed:', error.message)
    return NextResponse.json({ error: 'Suppression impossible.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
