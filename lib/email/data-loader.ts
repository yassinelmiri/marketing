import type { EmailCampaign, EmailTemplate, EmailUnsubscribe, SmtpAccount } from '@/lib/email/types'
import { normalizeTemplate } from '@/lib/email/view-utils'

type ApiResponse = {
  accounts?: SmtpAccount[]
  campaigns?: EmailCampaign[]
  templates?: unknown[]
  unsubscribes?: EmailUnsubscribe[]
}

export type EmailSenderData = {
  accounts: SmtpAccount[]
  campaigns: EmailCampaign[]
  templates: EmailTemplate[]
  unsubscribes: EmailUnsubscribe[]
}

const EMAIL_DATA_ENDPOINTS = [
  '/api/email/smtp-accounts',
  '/api/email/send',
  '/api/email/templates',
  '/api/email/unsubscribes',
] as const

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || 'Erreur de chargement des données e-mail.')
  }
  return data as T
}

/** Load the independent email workspace resources concurrently. */
export async function loadEmailSenderData(): Promise<EmailSenderData> {
  const responses = await Promise.all(EMAIL_DATA_ENDPOINTS.map((endpoint) => fetchJson<ApiResponse>(endpoint)))

  return {
    accounts: responses[0].accounts ?? [],
    campaigns: responses[1].campaigns ?? [],
    templates: Array.isArray(responses[2].templates)
      ? responses[2].templates.map(normalizeTemplate)
      : [],
    unsubscribes: responses[3].unsubscribes ?? [],
  }
}
