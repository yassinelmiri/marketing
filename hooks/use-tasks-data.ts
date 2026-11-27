'use client'

import { useCallback, useEffect, useState } from 'react'

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

export function useTasksData(userId: number) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<TaskMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadTasks = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/tasks', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Chargement des tâches impossible.')
      setTasks(data.tasks ?? [])
      setMembers(data.members ?? [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTasks()
  }, [userId, loadTasks])

  return { tasks, setTasks, members, loading, error, setError, loadTasks }
}
