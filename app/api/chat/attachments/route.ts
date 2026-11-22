import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

async function authorize() {
  const session = await createClient()
  const { data: auth, error } = await session.auth.getUser()
  if (error || !auth.user) return { response: NextResponse.json({ error: 'Connexion requise.' }, { status: 401 }) }
  const { data: profile, error: profileError } = await session.from('user_profiles')
    .select('id').eq('auth_user_id', auth.user.id).maybeSingle()
  if (profileError || !profile) return { response: NextResponse.json({ error: 'Profil non autorisé.' }, { status: 403 }) }
  try {
    return { admin: createAdminClient(), userId: Number(profile.id) } as const
  } catch {
    return { response: NextResponse.json({ error: 'Configuration serveur indisponible.' }, { status: 503 }) }
  }
}

function checkOrigin(req: NextRequest) {
  const origin = req.headers.get('origin')
  if (!origin) return NextResponse.json({ error: 'Origin manquant.' }, { status: 403 })
  try {
    if (new URL(origin).origin !== req.nextUrl.origin) return NextResponse.json({ error: 'Origin refusé.' }, { status: 403 })
  } catch {
    return NextResponse.json({ error: 'Origin invalide.' }, { status: 403 })
  }
  return null
}

function safeFileName(name: string) {
  const cleaned = name.normalize('NFKC')
    .replace(/[\/\\\x00-\x1f\x7f]/g, '_')
    .replace(/[^\p{L}\p{N}._ -]/gu, '_')
    .trim()
  return (cleaned || 'fichier').slice(0, 150)
}

export async function POST(req: NextRequest) {
  const originError = checkOrigin(req)
  if (originError) return originError
  const auth = await authorize()
  if ('response' in auth) return auth.response

  let form: FormData
  try { form = await req.formData() } catch {
    return NextResponse.json({ error: 'Formulaire invalide.' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Sélectionnez un fichier.' }, { status: 400 })
  if (file.size < 1 || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'La taille maximale autorisée est de 10 Mo.' }, { status: 413 })
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Format non autorisé. Images, PDF, TXT, DOCX et XLSX uniquement.' }, { status: 415 })

  const { count: recentUploads, error: quotaError } = await auth.admin.from('team_chat_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.userId)
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
  if (quotaError) return NextResponse.json({ error: 'Vérification de quota impossible.' }, { status: 500 })
  if ((recentUploads ?? 0) >= 30) return NextResponse.json({ error: 'Limite de 30 fichiers par heure atteinte.' }, { status: 429 })

  const originalName = safeFileName(file.name)
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'application/pdf': 'pdf', 'text/plain': 'txt',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  }
  const path = `${auth.userId}/${randomUUID()}.${extensions[file.type]}`
  const bytes = Buffer.from(await file.arrayBuffer())

  // Basic signature checks prevent files with a renamed extension from being rendered as images/PDF.
  const signatures: Record<string, number[]> = {
    'image/jpeg': [0xff, 0xd8, 0xff],
    'image/png': [0x89, 0x50, 0x4e, 0x47],
    'image/gif': [0x47, 0x49, 0x46, 0x38],
    'application/pdf': [0x25, 0x50, 0x44, 0x46],
  }
  const signature = signatures[file.type]
  if (signature && !signature.every((byte, index) => bytes[index] === byte)) {
    return NextResponse.json({ error: 'Le contenu du fichier ne correspond pas à son format.' }, { status: 415 })
  }
  if (file.type === 'image/webp' && (bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.toString('ascii', 0, 4) !== 'RIFF')) {
    return NextResponse.json({ error: 'Image WebP invalide.' }, { status: 415 })
  }
  if (
    (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    && !(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)
  ) {
    return NextResponse.json({ error: 'Document Office invalide.' }, { status: 415 })
  }
  if (file.type === 'text/plain' && bytes.includes(0)) {
    return NextResponse.json({ error: 'Le fichier texte contient des données binaires.' }, { status: 415 })
  }

  const { error: uploadError } = await auth.admin.storage.from('team-chat-private').upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  })
  if (uploadError) {
    console.error('[chat-upload] storage upload failed:', uploadError.message)
    return NextResponse.json({ error: 'Envoi du fichier impossible.' }, { status: 500 })
  }

  const { data, error } = await auth.admin.from('team_chat_attachments').insert({
    user_id: auth.userId,
    file_name: originalName,
    storage_path: path,
    mime_type: file.type,
    file_size: file.size,
  }).select('id,user_id,file_name,mime_type,file_size,created_at').single()

  if (error || !data) {
    await auth.admin.storage.from('team-chat-private').remove([path])
    console.error('[chat-upload] metadata insert failed:', error?.message)
    return NextResponse.json({ error: 'Enregistrement du fichier impossible.' }, { status: 500 })
  }

  const { data: signed } = await auth.admin.storage.from('team-chat-private').createSignedUrl(path, 60 * 5)
  return NextResponse.json(
    { attachment: { ...data, signed_url: signed?.signedUrl ?? null } },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function DELETE(req: NextRequest) {
  const originError = checkOrigin(req)
  if (originError) return originError
  const auth = await authorize()
  if ('response' in auth) return auth.response

  let body: { id?: number }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
  const id = Number(body.id)
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Identifiant de fichier invalide.' }, { status: 400 })
  }

  const { data: attachment, error } = await auth.admin.from('team_chat_attachments')
    .select('id,storage_path')
    .eq('id', id)
    .eq('user_id', auth.userId)
    .is('message_id', null)
    .maybeSingle()
  if (error || !attachment) {
    return NextResponse.json({ error: 'Fichier introuvable ou déjà partagé.' }, { status: 404 })
  }

  const { error: storageError } = await auth.admin.storage.from('team-chat-private')
    .remove([attachment.storage_path])
  if (storageError) {
    console.error('[chat-upload] pending file cleanup failed:', storageError.message)
    return NextResponse.json({ error: 'Suppression du fichier impossible.' }, { status: 500 })
  }

  const { error: deleteError } = await auth.admin.from('team_chat_attachments')
    .delete().eq('id', id).eq('user_id', auth.userId).is('message_id', null)
  if (deleteError) return NextResponse.json({ error: 'Suppression des informations du fichier impossible.' }, { status: 500 })
  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } })
}
