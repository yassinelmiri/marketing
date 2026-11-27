import type { RecurrenceFrequency } from './types'

/**
 * Calculate the next calendar date for a recurring task.
 * UTC noon avoids timezone-boundary shifts; month/year dates are clamped
 * to the last valid day (for example, January 31 -> February 28/29).
 */
export function getNextRecurringDueDate(
  dueDate: string,
  frequency: Exclude<RecurrenceFrequency, 'none'>,
  intervalValue: number,
): string {
  const next = new Date(dueDate + 'T12:00:00.000Z')
  const interval = Math.max(1, Math.min(365, Number(intervalValue) || 1))

  if (frequency === 'daily') next.setUTCDate(next.getUTCDate() + interval)
  if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + 7 * interval)

  if (frequency === 'monthly') {
    const day = next.getUTCDate()
    next.setUTCDate(1)
    next.setUTCMonth(next.getUTCMonth() + interval)
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()
    next.setUTCDate(Math.min(day, lastDay))
  }

  if (frequency === 'yearly') {
    const month = next.getUTCMonth()
    const day = next.getUTCDate()
    next.setUTCDate(1)
    next.setUTCFullYear(next.getUTCFullYear() + interval)
    next.setUTCMonth(month)
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), month + 1, 0)).getUTCDate()
    next.setUTCDate(Math.min(day, lastDay))
  }

  return next.toISOString().slice(0, 10)
}
