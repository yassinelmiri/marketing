import type { Metadata } from 'next'
import { AuthPage } from '@/components/marketing/auth-page'

export const metadata: Metadata = {
  title: 'Connexion — Anntel Marketing',
  description: 'Connectez-vous à votre espace de travail Anntel Marketing.',
}

export default function LoginPage() {
  return <AuthPage mode="login" />
}