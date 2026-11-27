import type { WhatsAppContactStatus } from './file-parser'

export type WhatsAppContactStats = {
  total: number
  sent: number
  failed: number
  skipped: number
  pending: number
}

export function getWhatsAppContactStats(
  contacts: readonly { status: WhatsAppContactStatus }[],
): WhatsAppContactStats {
  return contacts.reduce<WhatsAppContactStats>((counts, contact) => {
    counts.total += 1

    switch (contact.status) {
      case 'sent':
        counts.sent += 1
        break
      case 'failed':
        counts.failed += 1
        break
      case 'skipped':
        counts.skipped += 1
        break
      case 'pending':
      case 'opened':
        counts.pending += 1
        break
    }

    return counts
  }, { total: 0, sent: 0, failed: 0, skipped: 0, pending: 0 })
}
