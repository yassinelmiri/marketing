import { NextResponse, type NextRequest } from 'next/server'

/**
 * Reject state-changing browser requests that do not originate from this app.
 * This is a CSRF defense-in-depth check; authentication and authorization
 * must still be performed independently by each route.
 */
export function sameOriginError(request: NextRequest): NextResponse | null {
  const origin = request.headers.get('origin')
  if (!origin) return NextResponse.json({ error: 'Origine manquante.' }, { status: 403 })

  try {
    if (new URL(origin).origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Origine invalide.' }, { status: 403 })
  }

  return null
}
