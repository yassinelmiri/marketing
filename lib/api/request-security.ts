import { NextResponse, type NextRequest } from 'next/server'

type OriginErrorMessages = {
  missing?: string
  forbidden?: string
  invalid?: string
}

/**
 * Reject state-changing browser requests that do not originate from this app.
 * Authentication and authorization must still be performed independently.
 */
export function sameOriginError(
  request: NextRequest,
  messages: OriginErrorMessages = {},
): NextResponse | null {
  const origin = request.headers.get('origin')
  if (!origin) {
    return NextResponse.json({ error: messages.missing ?? 'Origine manquante.' }, { status: 403 })
  }

  try {
    if (new URL(origin).origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: messages.forbidden ?? 'Origine non autorisée.' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: messages.invalid ?? 'Origine invalide.' }, { status: 403 })
  }

  return null
}
