import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const rawUrl = new URL(request.url).searchParams.get('url') ?? ''
  let destination: URL
  try { destination = new URL(rawUrl) } catch { return new Response('Lien invalide.', { status: 400 }) }
  if (!['http:', 'https:'].includes(destination.protocol) || destination.username || destination.password) {
    return new Response('Destination non autorisée.', { status: 400 })
  }
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response('Lien introuvable.', { status: 404 })
  const admin = createAdminClient()
  const { data, error } = await admin.from('email_campaign_recipients').select('id,clicked_at').eq('tracking_token', token).maybeSingle()
  if (error || !data) return new Response('Lien introuvable.', { status: 404 })
  if (!data.clicked_at) await admin.from('email_campaign_recipients').update({ clicked_at: new Date().toISOString() }).eq('id', data.id)
  return Response.redirect(destination.toString(), 302)
}
