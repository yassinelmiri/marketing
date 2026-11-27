
import type { Metadata } from 'next'
import './globals.css'
import './workspace-feature-overrides.css'
import './design-system.css'
import './prospection-email-theme.css'
import { ToastProvider } from '@/components/ui/toast'
import { ReduxProvider } from '@/components/providers/redux-provider'
import SecurityGuard from '@/components/SecurityGuard'

export const metadata: Metadata = {
  title: 'Anntel Marketing — Plateforme multicanal',
  description:
    'Organisez vos campagnes e-mail, WhatsApp et SMS au même endroit, avec votre équipe.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" data-workspace-theme="dark" suppressHydrationWarning>
      <body>
        <ReduxProvider>
          <ToastProvider>
            <SecurityGuard />
            {children}
          </ToastProvider>
        </ReduxProvider>
      </body>
    </html>
  )
}
