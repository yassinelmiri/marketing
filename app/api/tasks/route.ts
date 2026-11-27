import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sameOriginError } from '@/lib/api/request-security'
import { getNextRecurringDueDate } from '@/lib/tasks/recurrence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Profile = { id: number; role_id: number; prenom: string; nom: string }
type TaskStatus = 'todo' | 'in_progress' | 'waiting' | 'done'
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
type RecurrenceFrequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

async function access() {
  const session = await createClient()
  const { data: auth, error: authError } = await session.auth.getUser()

  if (authError || !auth.user) {
    return { response: NextResponse.json({ error: 'Connexion requise.' }, { status: 401 }) }
  }

  const { data: profile, error } = await session
    .from('user_profiles')
    .select('id, role_id, prenom, nom')
    .eq('auth_user_id', auth.user.id)
    .maybeSingle()

  if (error || !profile) {
    return { response: NextResponse.json({ error: 'Profil utilisateur introuvable.' }, { status: 403 }) }
  }

  try {
    const admin = createAdminClient()
    return { admin, profile: profile as Profile, isAdmin: Number(profile.role_id) === 1 } as const
  } catch {
    return { response: NextResponse.json({ error: 'Configuration serveur indisponible.' }, { status: 503 }) }
  }
}

function validStatus(value: unknown): value is TaskStatus {
  return ['todo', 'in_progress', 'waiting', 'done'].includes(String(value))
}

function validPriority(value: unknown): value is TaskPriority {
  return ['low', 'medium', 'high', 'urgent'].includes(String(value))
}


function validRecurrence(value: unknown): value is RecurrenceFrequency {
  return ['none', 'daily', 'weekly', 'monthly', 'yearly'].includes(String(value))
}

async function createNextOccurrence(admin: ReturnType<typeof createAdminClient>, taskId: number) {
  const { data: task, error: taskError } = await admin.from('tasks').select('*').eq('id', taskId).maybeSingle()
  if (taskError || !task || task.recurrence_frequency === 'none' || !task.due_date) return

  const nextDueDate = getNextRecurringDueDate(
    String(task.due_date),
    task.recurrence_frequency,
    Number(task.recurrence_interval) || 1,
  )
  if (task.recurrence_until && nextDueDate > String(task.recurrence_until)) return

  const seriesId = Number(task.recurrence_series_id ?? task.id)
  const { data: nextTask, error: insertError } = await admin.from('tasks').insert({
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: 'todo',
    due_date: nextDueDate,
    created_by: task.created_by,
    recurrence_frequency: task.recurrence_frequency,
    recurrence_interval: interval,
    recurrence_until: task.recurrence_until,
    recurrence_series_id: seriesId,
  }).select('*').single()

  // A unique series/date index makes concurrent completion requests idempotent.
  if (insertError?.code === '23505') return
  if (insertError || !nextTask) {
    console.error('[tasks] next recurring occurrence could not be created:', insertError?.message)
    return
  }

  const { data: assignments, error: assignmentsError } = await admin
    .from('task_assignments').select('user_id').eq('task_id', taskId)
  if (assignmentsError || !assignments?.length) return

  const userIds = assignments.map((row) => Number(row.user_id))
  const { error: assignmentError } = await admin.from('task_assignments').insert(
    userIds.map((user_id) => ({ task_id: nextTask.id, user_id })),
  )
  if (assignmentError) {
    await admin.from('tasks').delete().eq('id', nextTask.id)
    console.error('[tasks] next recurring assignments failed:', assignmentError.message)
    return
  }

  await admin.from('notifications').insert(userIds.map((user_id) => ({
    user_id,
    type: 'task_assigned',
    title: 'Nouvelle occurrence de tâche',
    body: task.title,
    task_id: nextTask.id,
  })))
}

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
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
  const [assignmentResult, memberResult] = await Promise.all([
    taskIds.length
      ? admin.from('task_assignments').select('task_id,user_id').in('task_id', taskIds)
      : Promise.resolve({ data: [], error: null }),
    isAdmin
      ? admin.from('user_profiles').select('id,prenom,nom,email').order('prenom')
      : Promise.resolve({ data: [] }),
  ])
  const { data: assignments, error: assignmentError } = assignmentResult

  if (assignmentError) {
    return NextResponse.json({ error: 'Chargement des affectations impossible.' }, { status: 500 })
  }

  const memberIds = Array.from(new Set((assignments ?? []).map((assignment) => Number(assignment.user_id))))
  const visibleTaskIds = new Set<number>()
  if (!isAdmin) {
    for (const assignment of assignments ?? []) {
      if (Number(assignment.user_id) === profile.id) visibleTaskIds.add(Number(assignment.task_id))
    }
  }
  const { data: assignedProfiles } = !isAdmin && memberIds.length
    ? await admin.from('user_profiles').select('id,prenom,nom,email').in('id', memberIds)
    : { data: [] }

  const profiles = isAdmin ? (memberResult.data ?? []) : (assignedProfiles ?? [])
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
      tasks: isAdmin ? rows : rows.filter((task) => visibleTaskIds.has(Number(task.id))),
      members: isAdmin ? (profiles ?? []) : [],
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: NextRequest) {
  const originError = sameOriginError(request, { missing: 'Origin manquant.', forbidden: 'Origin refusé.' })
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
  const recurrenceFrequency = body.recurrence_frequency ?? 'none'
  const recurrenceInterval = Math.max(1, Math.min(365, Number(body.recurrence_interval) || 1))
  const recurrenceUntil = typeof body.recurrence_until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.recurrence_until) ? body.recurrence_until : null
  const assigneeIds = Array.isArray(body.assignee_ids)
    ? [...new Set(body.assignee_ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
    : []

  if (!title) return NextResponse.json({ error: 'Le titre de la tâche est obligatoire.' }, { status: 400 })
  if (!validPriority(priority) || !validStatus(status) || !validRecurrence(recurrenceFrequency)) {
    return NextResponse.json({ error: 'Priorité ou statut invalide.' }, { status: 400 })
  }
  if (recurrenceFrequency !== 'none' && !dueDate) return NextResponse.json({ error: 'Une date limite est obligatoire pour une tâche répétitive.' }, { status: 400 })
  if (recurrenceUntil && dueDate && recurrenceUntil < dueDate) return NextResponse.json({ error: 'La date de fin doit être après la première échéance.' }, { status: 400 })
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
      recurrence_frequency: recurrenceFrequency,
      recurrence_interval: recurrenceInterval,
      recurrence_until: recurrenceUntil,
      recurrence_series_id: null,
    })
    .select('*')
    .single()

  if (error || !task) return NextResponse.json({ error: 'Création de tâche impossible.' }, { status: 500 })

  if (recurrenceFrequency !== 'none') {
    const { error: seriesError } = await result.admin.from('tasks').update({ recurrence_series_id: task.id }).eq('id', task.id)
    if (seriesError) {
      await result.admin.from('tasks').delete().eq('id', task.id)
      return NextResponse.json({ error: 'Initialisation de la répétition impossible.' }, { status: 500 })
    }
  }

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
  const originError = sameOriginError(request, { missing: 'Origin manquant.', forbidden: 'Origin refusé.' })
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
    if (task.status !== 'done' && body.status === 'done') await createNextOccurrence(result.admin, id)

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
  const recurrenceFrequency = body.recurrence_frequency ?? task.recurrence_frequency ?? 'none'
  const recurrenceInterval = Math.max(1, Math.min(365, Number(body.recurrence_interval ?? task.recurrence_interval) || 1))
  const recurrenceUntil = typeof body.recurrence_until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.recurrence_until) ? body.recurrence_until : body.recurrence_until === null ? null : (task.recurrence_until ?? null)
  if (!title || !validPriority(body.priority) || !validStatus(body.status) || !validRecurrence(recurrenceFrequency)) {
    return NextResponse.json({ error: 'Titre, priorité ou statut invalide.' }, { status: 400 })
  }

  const dueDate =
    typeof body.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date) ? body.due_date : null
  const assigneeIds = Array.isArray(body.assignee_ids)
    ? [...new Set(body.assignee_ids.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))]
    : []

  if (recurrenceFrequency !== 'none' && !dueDate) return NextResponse.json({ error: 'Une date limite est obligatoire pour une tâche répétitive.' }, { status: 400 })
  if (recurrenceUntil && dueDate && recurrenceUntil < dueDate) return NextResponse.json({ error: 'La date de fin doit être après la première échéance.' }, { status: 400 })
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
      recurrence_frequency: recurrenceFrequency,
      recurrence_interval: recurrenceInterval,
      recurrence_until: recurrenceUntil,
      recurrence_series_id: recurrenceFrequency === 'none' ? null : (task.recurrence_series_id ?? task.id),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: 'Modification de tâche impossible.' }, { status: 500 })

  const { error: deleteError } = await result.admin.from('task_assignments').delete().eq('task_id', id)
  if (deleteError) return NextResponse.json({ error: 'Réinitialisation des affectations impossible.' }, { status: 500 })

  const { error: insertError } = await result.admin
    .from('task_assignments')
    .insert(assigneeIds.map((user_id) => ({ task_id: id, user_id })))

  if (insertError) return NextResponse.json({ error: 'Enregistrement des affectations impossible.' }, { status: 500 })

  if (task.status !== 'done' && body.status === 'done') await createNextOccurrence(result.admin, id)

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
  const originError = sameOriginError(request, { missing: 'Origin manquant.', forbidden: 'Origin refusé.' })
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
