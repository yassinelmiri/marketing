import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CONTACT_COLUMNS = 'id,nom,prenom,reseau_social,telephone,mobile,address,code_postal,ville,email,profile,date_creation,date_modification,created_by,commentaire'

async function authorize() {
  const supabase = await createClient()
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) return { response: NextResponse.json({ error: 'Connexion requise.' }, { status: 401 }) }
  const [{ data: allowed, error: permissionError }, { data: assignedAccess, error: assignedError }] = await Promise.all([
    supabase.rpc('has_permission', { permission_code: 'listes.read' }),
    supabase.rpc('has_assigned_contact_list_access'),
  ])
  if ((permissionError && assignedError) || (!allowed && !assignedAccess)) {
    return { response: NextResponse.json({ error: 'Accès aux contacts refusé.' }, { status: 403 }) }
  }
  return { supabase, canReadAll: Boolean(allowed) } as const
}

export async function GET(request: NextRequest) {
  const auth = await authorize()
  if ('response' in auth) return auth.response
  const { supabase } = auth

  try {
    if (request.nextUrl.searchParams.get('counts') === '1') {
      const [{ data: total, error: totalError }, { data: counts, error: countsError }] = await Promise.all([
        supabase.rpc('get_visible_contact_total'),
        supabase.rpc('get_contact_list_counts'),
      ])
      if (totalError || countsError) {
        console.error('[contacts] counts query failed:', {
          totalError: totalError ? { code: totalError.code, message: totalError.message, details: totalError.details, hint: totalError.hint } : null,
          countsError: countsError ? { code: countsError.code, message: countsError.message, details: countsError.details, hint: countsError.hint } : null,
        })
        throw totalError || countsError
      }
      const listCounts = Object.fromEntries((counts ?? []).map((row: { list_id: number; contact_count: number }) => [Number(row.list_id), Number(row.contact_count)]))
      return NextResponse.json({ total: Number(total ?? 0), listCounts }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
    }

    const page = Math.max(1, Math.min(100000, Number(request.nextUrl.searchParams.get('page')) || 1))
    const pageSize = Math.max(10, Math.min(100, Number(request.nextUrl.searchParams.get('pageSize')) || 50))
    const listId = Number(request.nextUrl.searchParams.get('listId') || 0)
    const rawSearch = (request.nextUrl.searchParams.get('q') || '').trim().slice(0, 100)
    const dateFrom = request.nextUrl.searchParams.get('dateFrom') || ''
    const dateTo = request.nextUrl.searchParams.get('dateTo') || ''
    const validDate = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value)
    if (!validDate(dateFrom) || !validDate(dateTo) || (dateFrom && dateTo && dateFrom > dateTo)) {
      return NextResponse.json({ error: 'Période de dates invalide.' }, { status: 400 })
    }
    const dateToExclusive = dateTo ? new Date(Date.parse(dateTo + 'T00:00:00.000Z') + 86400000).toISOString() : null
    const search = rawSearch.replace(/[,%()\\"]/g, ' ').replace(/\s+/g, ' ').trim()
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const searchFilter = search
      ? 'nom.ilike.%' + search + '%,prenom.ilike.%' + search + '%,email.ilike.%' + search + '%,telephone.ilike.%' + search + '%,ville.ilike.%' + search + '%'
      : null
    const hasListFilter = Number.isSafeInteger(listId) && listId > 0

    // For a list-scoped read, verify access with the trusted RPC first, then use
    // the service client to avoid evaluating the per-contact RLS policy on every
    // joined row. The service client is never used before this authorization.
    let readClient = supabase
    if (hasListFilter) {
      const { data: canReadList, error: accessError } = await supabase.rpc('can_read_contact_list', { target_list_id: listId })
      if (accessError) throw accessError
      if (!canReadList) return NextResponse.json({ error: 'Accès à cette liste refusé.' }, { status: 403 })
      readClient = createAdminClient() as typeof supabase
    }

    let filtered = readClient.from('contacts').select(
      hasListFilter
        ? CONTACT_COLUMNS + ',liste_contacts!inner(id,liste_id,contact_id,date_ajout)'
        : CONTACT_COLUMNS,
      { count: 'exact' },
    )
    if (hasListFilter) filtered = filtered.eq('liste_contacts.liste_id', listId)
    if (searchFilter) filtered = filtered.or(searchFilter)
    if (dateFrom) filtered = filtered.gte('date_creation', dateFrom + 'T00:00:00.000Z')
    if (dateToExclusive) filtered = filtered.lt('date_creation', dateToExclusive)

    // Charger les contacts et leurs associations à la liste dans la même requête.
    const { data: rows, count, error } = await filtered.order('date_creation', { ascending: false }).order('id', { ascending: false }).range(from, to)
    if (error) {
      console.error('[contacts] read query failed:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      })
      throw error
    }

    const contactIds = (rows ?? []).map((row: any) => Number(row.id)).filter(Number.isSafeInteger)
    const links = hasListFilter
      ? (rows ?? []).flatMap((row: any) => Array.isArray(row.liste_contacts) ? row.liste_contacts : [])
      : await (async () => {
          if (!contactIds.length) return []
          const { data, error: linksError } = await supabase
            .from('liste_contacts')
            .select('id,liste_id,contact_id,date_ajout')
            .in('contact_id', contactIds)
          if (linksError) throw linksError
          return data ?? []
        })()

    const contacts = (rows ?? []).map((row: any) => ({
      ...row,
      id: Number(row.id),
      created_by: Number(row.created_by ?? 0),
      liste_contacts: undefined,
    }))
    return NextResponse.json({
      contacts,
      links: links.map((link: any) => ({ ...link, id: Number(link.id), liste_id: Number(link.liste_id), contact_id: Number(link.contact_id) })),
      total: Number(count ?? 0),
      listCount: listId > 0 ? Number(count ?? 0) : 0,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(Number(count ?? 0) / pageSize)),
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  } catch (error) {
    console.error('[contacts] paginated read failed:', error)
    return NextResponse.json({ error: 'Impossible de charger les contacts.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

 
export async function DELETE(request: NextRequest) {
  const auth = await authorize()
  if ('response' in auth) return auth.response

  try {
    const body = await request.json()
    const rawIds = Array.isArray(body?.ids) ? body.ids : []
    const ids = [...new Set(rawIds.map((value: unknown) => Number(value)))]
    if (ids.length === 0 || ids.length > 100 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      return NextResponse.json({ error: 'Sélection invalide. Choisissez entre 1 et 100 contacts.' }, { status: 400 })
    }

    // Use a server-only admin client after verifying the user's session and module permission.
    const admin = createAdminClient()
    const { error: linksError } = await admin.from('liste_contacts').delete().in('contact_id', ids)
    if (linksError) throw linksError
    const { data: deleted, error: deleteError } = await admin.from('contacts').delete().in('id', ids).select('id')
    if (deleteError) throw deleteError

    return NextResponse.json({ deleted: deleted?.length ?? 0 }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    })
  } catch (error) {
    console.error('[contacts] bulk delete failed:', error)
    return NextResponse.json({ error: 'Impossible de supprimer les contacts sélectionnés.' }, { status: 500 })
  }
}
