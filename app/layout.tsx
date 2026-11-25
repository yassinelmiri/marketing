
import type { Metadata } from 'next'
import './globals.css'
import './design-system.css'
import { ToastProvider } from '@/components/ui/toast'
import SecurityGuard from '@/components/SecurityGuard'

export const metadata: Metadata = {
  title: 'Anntel Marketing — Plateforme multicanal',
  description:
    'Organisez vos campagnes e-mail, WhatsApp et SMS au même endroit, avec votre équipe.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <ToastProvider>
          <SecurityGuard />
          {children}
        </ToastProvider>
      </body>
    </html>
  )
}
