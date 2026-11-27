import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Authenticate the current user and enforce access to the email workspace. */
export async function authorizeEmailAccess() {
  const session = await createClient()
  const { data: auth, error: authError } = await session.auth.getUser()

  if (authError || !auth.user) {
    return { response: NextResponse.json({ error: 'Authentification requise.' }, { status: 401 }) } as const
  }

  const { data: profile, error: profileError } = await session
    .from('user_profiles')
    .select('*')
    .eq('auth_user_id', auth.user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return { response: NextResponse.json({ error: 'Profil utilisateur introuvable.' }, { status: 403 }) } as const
  }

  const isAdmin = Number(profile.role_id) === 1
  if (!isAdmin) {
    const { data: allowed, error: permissionError } = await session.rpc('has_permission', {
      permission_code: 'email.access',
    })

    if (permissionError || !allowed) {
      return { response: NextResponse.json({ error: 'Accès e-mail refusé.' }, { status: 403 }) } as const
    }
  }

  return { session, profile, user: auth.user, isAdmin } as const
}
