'use client'

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'

export type SavedWhatsAppCampaign = {
  id: number
  name: string
  source_file: string
  message: string
  status: 'draft' | 'in_progress' | 'paused' | 'completed'
  total_recipients: number
  updated_at: string
}

export function useWhatsAppCampaigns(setError: Dispatch<SetStateAction<string>>) {
  const [savedCampaigns, setSavedCampaigns] = useState<SavedWhatsAppCampaign[]>([])
  const [loadingSaved, setLoadingSaved] = useState(false)

  const refreshSavedCampaigns = useCallback(async () => {
    setLoadingSaved(true)
    try {
      const response = await fetch('/api/whatsapp/campaigns', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Chargement des campagnes impossible.')
      setSavedCampaigns(data.campaigns ?? [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chargement des campagnes impossible.')
    } finally {
      setLoadingSaved(false)
    }
  }, [setError])

  return { savedCampaigns, loadingSaved, refreshSavedCampaigns }
}
