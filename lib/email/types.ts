export interface SmtpAccount {
  id: number
  name: string
  email: string
  host: string
  port: number
  secure: boolean
  username: string
  from_name: string | null
  is_active: boolean
}

export interface EmailCampaign {
  id: number
  created_by_name?: string | null
  subject: string
  message?: string
  reply_to?: string | null
  batch_size?: number
  batch_delay_seconds?: number
  liste_nom: string
  sender_email: string
  sent_count: number
  failed_count: number
  status: string
  created_at: string
  total_recipients?: number
  recipient_offset?: number
  scheduled_at?: string | null
  next_batch_at?: string | null
  open_count?: number
  click_count?: number
}

export interface EmailTemplate {
  id: number
  name: string
  subject: string
  html_content: string
}

export interface EmailUnsubscribe {
  id: number
  email: string
  reason: string | null
  unsubscribed_at: string
}

export interface EmailActivity {
  campaign_id: number
  campaign_subject: string
  recipient_email: string
  event_type: string
  target_url: string | null
  created_at: string | null
}

export const EMPTY_SMTP_FORM = {
  name: '',
  email: '',
  host: 'smtp.ionos.fr',
  port: '587',
  secure: false,
  username: '',
  password: '',
  from_name: '',
}

const CAMPAIGN_TIME_ZONE = 'Africa/Casablanca'

export function campaignDateToInput(value?: string | null): string {
  if (!value) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAMPAIGN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const get = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return get('year') + '-' + get('month') + '-' + get('day') + 'T' + get('hour') + ':' + get('minute')
}

export function campaignInputToIso(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new Error('Date de lancement invalide.')

  const [, year, month, day, hour, minute] = match
  const desired = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
  let timestamp = desired

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: CAMPAIGN_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(timestamp))
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0)
    const represented = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
    const next = desired - (represented - timestamp)
    if (next === timestamp) break
    timestamp = next
  }

  return new Date(timestamp).toISOString()
}
