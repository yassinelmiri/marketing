import type { Task, TaskMember } from '@/hooks/use-tasks-data'

export type TaskDraft = {
  title: string
  description: string
  priority: Task['priority']
  status: Task['status']
  due_date: string
  assignee_ids: number[]
  recurrence_frequency: Task['recurrence_frequency']
  recurrence_interval: number
  recurrence_until: string
}

export const EMPTY_TASK_DRAFT: TaskDraft = {
  title: '',
  description: '',
  priority: 'medium',
  status: 'todo',
  due_date: '',
  assignee_ids: [],
  recurrence_frequency: 'none',
  recurrence_interval: 1,
  recurrence_until: '',
}

export const TASK_STATUS_LABELS: Record<Task['status'], string> = {
  todo: 'À faire',
  in_progress: 'En cours',
  waiting: 'En attente',
  done: 'Terminée',
}

export const TASK_PRIORITY_LABELS: Record<Task['priority'], string> = {
  low: 'Basse',
  medium: 'Moyenne',
  high: 'Haute',
  urgent: 'Urgente',
}

export const TASK_STATUS_COLORS: Record<Task['status'], string> = {
  todo: 'taskz-slate',
  in_progress: 'taskz-blue',
  waiting: 'taskz-amber',
  done: 'taskz-green',
}

export const TASK_PRIORITY_COLORS: Record<Task['priority'], string> = {
  low: 'taskz-slate',
  medium: 'taskz-blue',
  high: 'taskz-amber',
  urgent: 'taskz-red',
}

export function formatTaskDate(date: string | null): string {
  if (!date) return 'Sans échéance'
  return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function isTaskLate(task: Task, now = Date.now()): boolean {
  return task.status !== 'done'
    && !!task.due_date
    && new Date(task.due_date + 'T23:59:59').getTime() < now
}

export function getTaskMemberInitials(member: TaskMember): string {
  return (member.prenom?.[0] ?? '') + (member.nom?.[0] ?? '')
}
