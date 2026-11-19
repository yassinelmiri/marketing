import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Profile = { id: number; role_id: number; prenom: string; nom: string }
type TaskStatus = 'todo' | 'in_progress' | 'waiting' | 'done'
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

async function access() {
  const session = await createClient()
  const { data: auth, error: authError } = await session.auth.getUser()

  if (authError || !auth.user) {
    return { response: NextResponse.json({ error: 'Connexion requise.' }, { status: 401 }) as const }
  }

  const { data: profile, error } = await session
    .from('user_profiles')
    .select('id, role_id, prenom, nom')
    .eq('auth_user_id', auth.user.id)
    .maybeSingle()

  if (error || !profile) {
    return { response: NextResponse.json({ error: 'Profil utilisateur introuvable.' }, { status: 403 }) as const
  }

  try {
    const admin = createAdminClient()
    return { admin, profile: profile as Profile, isAdmin: Number(profile.role_id) === 1 } as const
  } catch {
    return { response: NextResponse.json({ error: 'Configuration serveur indisponible.' }, { status: 503 }) as const
  }
}

function validStatus(value: unknown): value is TaskStatus {
  return ['todo', 'in_progress', 'waiting', 'done'].includes(String(value))
}

function validPriority(value: unknown): value is TaskPriority {
  return ['low', 'medium', 'high', 'urgent'].includes(String(value))
}

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function originCheck(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin) return NextResponse.json({ error: 'Origin manquant.' }, { status: 403 })

  try {
    if (new URL(origin).origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: 'Origin refusé.' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Origin invalide.' }, { status: 403 })
  }

  return null
}

export async function GET() {
  const result = await access()
  if ('response' in result) return result.response

  const { admin, profile, isAdmin } = result
  const { data: tasks, error: taskError } = await admin
    .from('tasks')
    .select('*')
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (taskError) return NextResponse.json({ error: 'Chargement des tâches impossible.' }, { status: 500 })

  const taskIds = (tasks ?? []).map((task) => Number(task.id))
  const { data: assignments, error: assignmentError } = taskIds.length
    ? await admin.from('task_assignments').select('task_id,user_id').in('task_id', taskIds)
    : { data: [], error: null }

  if (assignmentError) {
    return NextResponse.json({ error: 'Chargement des affectations impossible.' }, { status: 500 })
  }

  const memberIds = Array.from(new Set((assignments ?? []).map((assignment) => Number(assignment.user_id))))
  const { data: assignedProfiles } = memberIds.length
    ? await admin.from('user_profiles').select('id,prenom,nom,email').in('id', memberIds)
    : { data: [] }

  const { data: allMembers } = isAdmin
    ? await admin.from('user_profiles').select('id,prenom,nom,email').order('prenom')
    : { data: [] }

  const profiles = isAdmin ? (allMembers ?? []) : (assignedProfiles ?? [])
  const profileById = new Map((profiles ?? []).map((member) => [Number(member.id), member]))
  const assigneesByTask = new Map<number, number[]>()

  for (const assignment of assignments ?? []) {
    const taskId = Number(assignment.task_id)
    const list = assigneesByTask.get(taskId) ?? []
    list.push(Number(assignment.user_id))
    assigneesByTask.set(taskId, list)
  }

  const rows = (tasks ?? []).map((task) => {
    const assigneeIds = assigneesByTask.get(Number(task.id)) ?? []
    return {
      ...task,
      assignee_ids: assigneeIds,
      assignees: assigneeIds.map((id) => profileById.get(id)).filter(Boolean),
    }
  })

  return NextResponse.json(
    {
      tasks: isAdmin ? rows : rows.filter((task) => task.assignee_ids.includes(profile.id)),
      members: isAdmin ? (profiles ?? []) : [],
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: NextRequest) {
  const originError = originCheck(request)
  if (originError) return originError

  const result = await access()
  if ('response' in result) return result.response
  if (!result.isAdmin) {
    return NextResponse.json({ error: 'Seul un administrateur peut créer et affecter des tâches.' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const title = cleanText(body.title, 160)
  const description = cleanText(body.description, 5000)
  const priority = body.priority
  const status = body.status
  const dueDate =
    typeof body.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date) ? body.due_date : null
  const assigneeIds = Array.isArray(body.assignee_ids)
    ? [...new Set(body.assignee_ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
    : []

  if (!title) return NextResponse.json({ error: 'Le titre de la tâche est obligatoire.' }, { status: 400 })
  if (!validPriority(priority) || !validStatus(status)) {
    return NextResponse.json({ error: 'Priorité ou statut invalide.' }, { status: 400 })
  }
  if (assigneeIds.length === 0) {
    return NextResponse.json({ error: 'Affectez la tâche à au moins un membre.' }, { status: 400 })
  }

  const { data: members, error: membersError } = await result.admin
    .from('user_profiles')
    .select('id')
    .in('id', assigneeIds)

  if (membersError || (members ?? []).length !== assigneeIds.length) {
    return NextResponse.json({ error: 'Un ou plusieurs membres sont introuvables.' }, { status: 400 })
  }

  const { data: task, error } = await result.admin
    .from('tasks')
    .insert({
      title,
      description,
      priority,
      status,
      due_date: dueDate,
      created_by: result.profile.id,
    })
    .select('*')
    .single()

  if (error || !task) return NextResponse.json({ error: 'Création de tâche impossible.' }, { status: 500 })

  const { error: assignmentError } = await result.admin
    .from('task_assignments')
    .insert(assigneeIds.map((user_id) => ({ task_id: task.id, user_id })))

  if (assignmentError) {
    await result.admin.from('tasks').delete().eq('id', task.id)
    return NextResponse.json({ error: 'Affectation impossible. La tâche créée a été annulée.' }, { status: 500 })
  }

  const { error: notificationError } = await result.admin
    .from('notifications')
    .insert(assigneeIds.map((user_id) => ({
      user_id,
      type: 'task_assigned',
      title: 'Nouvelle tâche assignée',
      body: title,
      task_id: task.id,
    })))

  if (notificationError) console.warn('[tasks] notification insertion failed:', notificationError.message)

  return NextResponse.json({ task }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const originError = originCheck(request)
  if (originError) return originError

  const result = await access()
  if ('response' in result) return result.response

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

  const { data: task, error: taskError } = await result.admin.from('tasks').select('*').eq('id', id).maybeSingle()
  if (taskError || !task) return NextResponse.json({ error: 'Tâche introuvable.' }, { status: 404 })

  if (!result.isAdmin) {
    const { data: assignment } = await result.admin
      .from('task_assignments')
      .select('task_id')
      .eq('task_id', id)
      .eq('user_id', result.profile.id)
      .maybeSingle()

    if (!assignment) return NextResponse.json({ error: 'Cette tâche ne vous est pas assignée.' }, { status: 403 })
    if (!validStatus(body.status)) return NextResponse.json({ error: 'Statut invalide.' }, { status: 400 })

    const { error } = await result.admin
      .from('tasks')
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) return NextResponse.json({ error: 'Mise à jour du statut impossible.' }, { status: 500 })

    if (task.created_by && Number(task.created_by) !== result.profile.id) {
      await result.admin.from('notifications').insert({
        user_id: task.created_by,
        type: 'task_status',
        title: 'Statut de tâche modifié',
        body: task.title,
        task_id: id,
      })
    }

    return NextResponse.json({ success: true })
  }

  const title = cleanText(body.title, 160)
  const description = cleanText(body.description, 5000)
  if (!title || !validPriority(body.priority) || !validStatus(body.status)) {
    return NextResponse.json({ error: 'Titre, priorité ou statut invalide.' }, { status: 400 })
  }

  const dueDate =
    typeof body.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date) ? body.due_date : null
  const assigneeIds = Array.isArray(body.assignee_ids)
    ? [...new Set(body.assignee_ids.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))]
    : []

  if (assigneeIds.length === 0) return NextResponse.json({ error: 'Affectez au moins un membre.' }, { status: 400 })

  const { data: members, error: membersError } = await result.admin
    .from('user_profiles')
    .select('id')
    .in('id', assigneeIds)

  if (membersError || (members ?? []).length !== assigneeIds.length) {
    return NextResponse.json({ error: 'Membres invalides.' }, { status: 400 })
  }

  const { data: previousAssignments } = await result.admin
    .from('task_assignments')
    .select('user_id')
    .eq('task_id', id)

  const previousIds = new Set((previousAssignments ?? []).map((assignment) => Number(assignment.user_id)))

  const { error: updateError } = await result.admin
    .from('tasks')
    .update({
      title,
      description,
      priority: body.priority,
      status: body.status,
      due_date: dueDate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: 'Modification de tâche impossible.' }, { status: 500 })

  const { error: deleteError } = await result.admin.from('task_assignments').delete().eq('task_id', id)
  if (deleteError) return NextResponse.json({ error: 'Réinitialisation des affectations impossible.' }, { status: 500 })

  const { error: insertError } = await result.admin
    .from('task_assignments')
    .insert(assigneeIds.map((user_id) => ({ task_id: id, user_id }))

  if (insertError) return NextResponse.json({ error: 'Enregistrement des affectations impossible.' }, { status: 500 })

  const newlyAssigned = assigneeIds.filter((userId) => !previousIds.has(userId))
  if (newlyAssigned.length) {
    await result.admin.from('notifications').insert(
      newlyAssigned.map((user_id) => ({
        user_id,
        type: 'task_assigned',
        title: 'Tâche mise à jour',
        body: title,
        task_id: id,
      })),
    )
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const originError = originCheck(request)
  if (originError) return originError

  const result = await access()
  if ('response' in result) return result.response
  if (!result.isAdmin) return NextResponse.json({ error: 'Accès administrateur requis.' }, { status: 403 })

  let body: { id?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const id = Number(body.id)
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 })

  const { error } = await result.admin.from('tasks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Suppression de tâche impossible.' }, { status: 500 })

  return NextResponse.json({ success: true })
}
