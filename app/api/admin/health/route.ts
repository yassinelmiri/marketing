import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ADMIN_ROLE_ID = 1
const TABLES = [
  'contacts',
  'liste_contacts',
  'campagnes',
  'campagne_listes',
  'campagne_membres',
  'commentaires',
  'type_campagnes',
  'user_profiles',
  'roles',
  'permissions',
  'role_permissions',
  'user_permissions',
  'tasks',
  'task_assignments',
  'notifications',
  'email_campaigns',
  'email_campaign_recipients',
  'email_delivery_logs',
  'email_templates',
  'email_unsubscribes',
  'prospection_leads',
] as const

type Alert = { level: 'warning' | 'error'; title: string; detail: string }

async function countTable(admin: ReturnType<typeof createAdminClient>, name: string) {
  const { count, error } = await admin.from(name).select('*', { count: 'exact', head: true })
  return { name, rows: error ? null : Number(count ?? 0), available: !error }
}

async function saveAlerts(
  admin: ReturnType<typeof createAdminClient>,
  userId: number,
  alerts: Alert[],
) {
  if (!alerts.length) return
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
  const { data: existing } = await admin
    .from('notifications')
    .select('title')
    .eq('user_id', userId)
    .eq('type', 'system_alert')
    .gte('created_at', since)
  const known = new Set((existing ?? []).map((item) => item.title))
  const fresh = alerts.filter((item) => !known.has(item.title))
  if (!fresh.length) return
  await admin.from('notifications').insert(fresh.map((item) => ({
    user_id: userId,
    type: 'system_alert',
    title: item.title,
    body: item.detail,
  })))
}

export async function GET(request: Request) {
  const session = await createClient()
  const { data: auth, error: authError } = await session.auth.getUser()
  if (authError || !auth.user) {
    return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await session
    .from('user_profiles')
    .select('id, role_id')
    .eq('auth_user_id', auth.user.id)
    .maybeSingle()

  if (profileError || !profile || Number(profile.role_id) !== ADMIN_ROLE_ID) {
    return NextResponse.json({ error: 'Accès administrateur requis.' }, { status: 403 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Configuration Supabase serveur indisponible.' }, { status: 503 })
  }

  const checkedAt = new Date().toISOString()
  const [tables, website] = await Promise.all([
    Promise.all(TABLES.map((name) => countTable(admin, name))),
    (async () => {
      const started = performance.now()
      try {
        const response = await fetch(new URL('/', request.url), {
          method: 'GET',
          cache: 'no-store',
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
          headers: { 'x-health-check': '1' },
        })
        const responseMs = Math.round(performance.now() - started)
        return {
          responseMs,
          status: !response.ok ? 'offline' as const : responseMs > 1500 ? 'slow' as const : 'online' as const,
          httpStatus: response.status,
          checkedAt,
        }
      } catch {
        return { responseMs: null, status: 'offline' as const, httpStatus: null, checkedAt }
      }
    })(),
  ])

  const totalRows = tables.reduce((sum, table) => sum + (table.rows ?? 0), 0)
  const criticalTables = new Set(['contacts', 'campagnes', 'user_profiles', 'notifications'])
  const unavailableCritical = tables.filter((table) => criticalTables.has(table.name) && !table.available)
  const alerts: Alert[] = []

  if (website.status === 'offline') {
    alerts.push({ level: 'error', title: 'Site web inaccessible', detail: 'Le test de la page d’accueil a échoué. Vérifiez le déploiement et les logs serveur.' })
  } else if (website.status === 'slow') {
    alerts.push({ level: 'warning', title: 'Site web lent', detail: `Temps de réponse mesuré : ${website.responseMs} ms.` })
  }

  if (unavailableCritical.length) {
    alerts.push({
      level: 'error',
      title: 'Tables principales indisponibles',
      detail: 'Vérifiez les tables Supabase : ' + unavailableCritical.map((table) => table.name).join(', '),
    })
  }

  await saveAlerts(admin, Number(profile.id), alerts)

  return NextResponse.json({
    database: { totalRows, tables, checkedAt },
    website,
    alerts,
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}
