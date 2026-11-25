import type { Metadata } from 'next'
import { MarketingWorkspace } from '@/components/marketing/marketing-workspace'
import { loadWorkspaceInitialData } from '@/lib/supabase/workspace-initial-data'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Espace de travail — Anntel Marketing',
  description: 'Gérez vos campagnes, contacts et modèles dans votre espace Anntel Marketing.',
}

export default async function WorkspacePage() {
  const initialData = await loadWorkspaceInitialData()
  return <MarketingWorkspace initialData={initialData} />
}