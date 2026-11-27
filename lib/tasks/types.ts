export type TaskMember = { id: number; prenom: string; nom: string; email?: string }

export type Task = {
  id: number
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'todo' | 'in_progress' | 'waiting' | 'done'
  due_date: string | null
  created_by: number | null
  created_at: string
  assignee_ids: number[]
  assignees: TaskMember[]
  recurrence_frequency: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
  recurrence_interval: number
  recurrence_until: string | null
  recurrence_series_id: number | null
}
