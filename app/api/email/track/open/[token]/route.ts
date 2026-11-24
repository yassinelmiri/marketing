import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response(null, { status: 404 })
  try {
    const admin = createAdminClient()
    await admin.from('email_campaign_recipients').update({ opened_at: new Date().toISOString() })
      .eq('tracking_token', token).is('opened_at', null)
  } catch (error) {
    console.error('[email/open-track] failed:', error)
  }
  const pixel = Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=', 'base64')
  return new Response(pixel, { headers: { 'Content-Type': 'image/gif', 'Content-Length': String(pixel.length), 'Cache-Control': 'no-store, no-cache, must-revalidate, private' } })
}
