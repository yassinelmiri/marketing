/**
 * Returns the UTC instant corresponding to midnight at the start of the
 * supplied date in the Africa/Casablanca time zone.
 */
export function getCasablancaDayStart(date: Date): Date {
  const timeZone = 'Africa/Casablanca'
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '0'
  const wallClockUtc = Date.UTC(Number(part('year')), Number(part('month')) - 1, Number(part('day')))
  const offsetLabel = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(date).find((item) => item.type === 'timeZoneName')?.value ?? 'GMT+00:00'
  const match = offsetLabel.match(/GMT([+-])(\\d{2}):(\\d{2})/)
  const offsetMinutes = match
    ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]))
    : 0
  return new Date(wallClockUtc - offsetMinutes * 60 * 1000)
}
