import type { Role, User } from '@/lib/storage'
import { createClient } from '@/lib/supabase/client'

type SupabaseClient = ReturnType<typeof createClient>

export interface WorkspaceTeamData {
  roles: Role[]
  users: User[]
}

/** Load the roles and the team members visible to the current workspace user. */
export async function loadWorkspaceTeamData(
  supabase: SupabaseClient,
  currentUser: Pick<User, 'id' | 'role_id'>,
): Promise<WorkspaceTeamData> {
  const [rolesResult, authResult] = await Promise.all([
    supabase.from('roles').select('id, nom, description'),
    currentUser.role_id === 1 ? Promise.resolve(null) : supabase.auth.getUser(),
  ])

  if (rolesResult.error) throw rolesResult.error

  if (authResult && (authResult.error || !authResult.data.user)) {
    throw authResult.error ?? new Error('Session expirée.')
  }

  const membersQuery = supabase
    .from('user_profiles')
    .select('id, prenom, nom, email, telephone, address, role_id, date_creation')

  const { data: members, error: membersError } = await (
    authResult?.data.user
      ? membersQuery.eq('auth_user_id', authResult.data.user.id).order('date_creation', { ascending: false })
      : membersQuery.order('date_creation', { ascending: false })
  )
  if (membersError) throw membersError

  return {
    roles: (rolesResult.data ?? []).map((role) => ({
      id: Number(role.id),
      nom: role.nom,
      description: role.description ?? '',
    })),
    users: (members ?? []).map((member) => ({
      id: Number(member.id),
      prenom: member.prenom ?? '',
      nom: member.nom ?? '',
      email: member.email ?? '',
      telephone: member.telephone ?? '',
      address: member.address ?? '',
      role_id: Number(member.role_id ?? 3),
      date_creation: member.date_creation,
      date_dernier_login: null,
      ip_address: null,
      permissions: [],
    })),
  }
}
