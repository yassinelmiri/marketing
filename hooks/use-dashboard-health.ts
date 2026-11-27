'use client'

import { useEffect, useState } from 'react'

type SystemHealth = {
  database: {
    totalRows: number
    sizeBytes: number | null
    limitBytes: number | null
    usagePercent: number | null
    tables: { name: string; rows: number | null; available: boolean }[]
    checkedAt: string
  } | null
  website: {
    responseMs: number | null
    status: 'online' | 'slow' | 'offline'
    checkedAt: string
  } | null
  alerts: { level: 'warning' | 'error'; title: string; detail: string }[]
}

export function useDashboardHealth(isAdmin: boolean) {
  const [systemHealth, setSystemHealth] = useState<SystemHealth>({
    database: null,
    website: null,
    alerts: [],
  })
  const [healthLoading, setHealthLoading] = useState(false)
  const [speedHistory, setSpeedHistory] = useState<{ time: string; ms: number }[]>([])

  useEffect(() => {
    if (!isAdmin) return
    let active = true

    const loadHealth = async () => {
      setHealthLoading(true)

      const loadDatabase = async () => {
        try {
          const response = await fetch('/api/admin/health', { cache: 'no-store' })
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || 'Diagnostic système indisponible')
          if (active) setSystemHealth((current) => ({ ...data, website: current.website }))
        } catch (error) {
          if (active) setSystemHealth((current) => ({
            ...current,
            alerts: [{
              level: 'error',
              title: 'Diagnostic indisponible',
              detail: error instanceof Error ? error.message : 'Impossible de vérifier le système.',
            }],
          }))
        }
      }

      const loadWebsiteSpeed = async () => {
        const started = performance.now()
        try {
          const response = await fetch('/api/health/ping', { cache: 'no-store' })
          const responseMs = Math.round(performance.now() - started)
          const website = {
            responseMs,
            status: !response.ok ? 'offline' as const : responseMs > 1500 ? 'slow' as const : 'online' as const,
            checkedAt: new Date().toISOString(),
          }

          if (active) {
            setSystemHealth((current) => ({ ...current, website }))
            setSpeedHistory((history) => [
              ...history,
              {
                time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                ms: responseMs,
              },
            ].slice(-30))
          }
        } catch {
          if (active) setSystemHealth((current) => ({
            ...current,
            website: { responseMs: null, status: 'offline', checkedAt: new Date().toISOString() },
          }))
        }
      }

      await Promise.all([loadDatabase(), loadWebsiteSpeed()])
      if (active) setHealthLoading(false)
    }

    void loadHealth()
    const interval = window.setInterval(() => void loadHealth(), 60000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [isAdmin])

  return { systemHealth, healthLoading, speedHistory }
}
