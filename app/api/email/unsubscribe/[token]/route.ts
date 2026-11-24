import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response('Lien de désabonnement invalide.', { status: 404 })
  const admin = createAdminClient()
  const { data, error } = await admin.from('email_campaign_recipients').select('email').eq('tracking_token', token).maybeSingle()
  if (error || !data) return new Response('Lien de désabonnement introuvable.', { status: 404 })
  const { error: insertError } = await admin.from('email_unsubscribes').upsert({ email: data.email.toLowerCase(), source: 'email_link' }, { onConflict: 'email' })
  if (insertError) return new Response('Impossible de traiter votre demande. Réessayez plus tard.', { status: 500 })
  return new Response('<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Désabonnement confirmé</title><body style="font-family:Arial,sans-serif;background:#f5f7fb;padding:48px 16px;color:#172033"><main style="max-width:520px;margin:auto;background:white;padding:32px;border-radius:16px"><h1>Désabonnement confirmé</h1><p>Votre adresse a été ajoutée à la liste de suppression. Vous ne recevrez plus les campagnes e-mail de cette plateforme.</p></main></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}
