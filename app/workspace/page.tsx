import type { Metadata } from 'next'
import { MarketingWorkspace } from '@/components/marketing/marketing-workspace'

export const metadata: Metadata = {
  title: 'Espace de travail — Anntel Marketing',
  description: 'Gérez vos campagnes, contacts et modèles dans votre espace Anntel Marketing.',
}

export default function WorkspacePage() {
  return <MarketingWorkspace />
}