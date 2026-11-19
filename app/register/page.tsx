import type { Metadata } from 'next'
import { AuthPage } from '@/components/marketing/auth-page'

export const metadata: Metadata = {
  title: 'Créer un compte — Anntel Marketing',
  description: 'Créez votre compte Anntel Marketing et commencez à organiser vos campagnes.',
}

export default function RegisterPage() {
  return <AuthPage mode="register" />
}