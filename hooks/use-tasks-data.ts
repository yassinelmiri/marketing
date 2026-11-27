'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Task, TaskMember } from '@/lib/tasks/types'

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
