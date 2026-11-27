import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ token: string }> }

async function findToken(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null
  const admin = createAdminClient()
  const { data, error } = await admin.from('email_unsubscribe_tokens')
    .select('token,email,campaign_id,used_at')
    .eq('token', token)
    .maybeSingle()
  if (error || !data) return null
  return { admin, data }
}

async function saveUnsubscribe(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  campaignId: number | null,
) {
  const normalized = email.trim().toLowerCase()
  const { data: existing, error: lookupError } = await admin.from('email_unsubscribes')
    .select('id')
    .ilike('email', normalized)
    .maybeSingle()
  if (lookupError) throw lookupError

  const payload = {
    email: normalized,
    campaign_id: campaignId,
    reason: 'Désabonnement depuis une campagne e-mail',
    unsubscribed_at: new Date().toISOString(),
  }
  const result = existing
    ? await admin.from('email_unsubscribes').update(payload).eq('id', existing.id)
    : await admin.from('email_unsubscribes').insert(payload)
  if (result.error) throw result.error
}

function confirmationPage(token: string) {
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Désabonnement</title></head>
<body style="font-family:Arial,sans-serif;max-width:560px;margin:12vh auto;padding:24px;color:#172554;line-height:1.6">
  <h1>Confirmer le désabonnement</h1>
  <p>Confirmez votre choix pour ne plus recevoir nos campagnes e-mail.</p>
  <form method="post">
    <button type="submit" style="border:0;border-radius:8px;padding:12px 20px;background:#4f46e5;color:white;font-weight:700;cursor:pointer">Confirmer mon désabonnement</button>
  </form>
</body>
</html>`
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { token } = await params
  const result = await findToken(token)
  if (!result) return new NextResponse('Lien de désabonnement invalide ou expiré.', { status: 404 })
  return new NextResponse(confirmationPage(token), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { token } = await params
  const result = await findToken(token)
  if (!result) return new NextResponse('Lien de désabonnement invalide ou expiré.', { status: 404 })

  try {
    await saveUnsubscribe(result.admin, result.data.email, result.data.campaign_id)
    await result.admin.from('email_unsubscribe_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('token', token)

    return new NextResponse('Désabonnement confirmé. Cette adresse ne recevra plus nos campagnes e-mail.', {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('[email/unsubscribe] failed:', error)
    return new NextResponse('Impossible de traiter votre demande. Réessayez plus tard.', { status: 500 })
  }
}
