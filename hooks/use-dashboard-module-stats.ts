'use client'

import { useEffect, useState } from 'react'
import {
  buildDashboardModuleStats,
  createEmptyDashboardModuleStats,
  type DashboardModuleStats,
} from '@/lib/dashboard/view-utils'

export function useDashboardModuleStats(isAdmin: boolean) {
  const [moduleStats, setModuleStats] = useState<DashboardModuleStats>(createEmptyDashboardModuleStats())
  const [moduleError, setModuleError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    if (!isAdmin) return
    let active = true

    const loadModules = async () => {
      const [emailResult, whatsappResult, tasksResult] = await Promise.allSettled([
        fetch('/api/email/send', { cache: 'no-store' }).then(async (response) => {
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || 'Email indisponible')
          return data
        }),
        fetch('/api/whatsapp/campaigns', { cache: 'no-store' }).then(async (response) => {
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || 'WhatsApp indisponible')
          return data
        }),
        fetch('/api/tasks', { cache: 'no-store' }).then(async (response) => {
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || 'Tâches indisponibles')
          return data
        }),
      ])

      if (!active) return

      setModuleStats(buildDashboardModuleStats({
        email: emailResult.status === 'fulfilled' ? emailResult.value : null,
        whatsapp: whatsappResult.status === 'fulfilled' ? whatsappResult.value : null,
        tasks: tasksResult.status === 'fulfilled' ? tasksResult.value : null,
      }))

      const failures = [emailResult, whatsappResult, tasksResult]
        .filter((result) => result.status === 'rejected').length
      setModuleError(failures ? `${failures} module(s) n'ont pas pu charger leurs statistiques selon vos accès.` : '')
      setLastUpdated(new Date())
    }

    void loadModules()
    const interval = window.setInterval(() => void loadModules(), 60000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [isAdmin])

  return { moduleStats, moduleError, lastUpdated }
}
