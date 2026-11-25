import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CONTACT_COLUMNS = 'id,nom,prenom,reseau_social,telephone,mobile,address,code_postal,ville,email,profile,date_creation,date_modification,created_by,commentaire'

async function authorize() {
  const supabase = await createClient()
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) return { response: NextResponse.json({ error: 'Connexion requise.' }, { status: 401 }) }
  const { data: allowed, error } = await supabase.rpc('has_permission', { permission_code: 'listes.read' })
  if (error || !allowed) return { response: NextResponse.json({ error: 'Accès aux contacts refusé.' }, { status: 403 }) }
  return { supabase } as const
}

export async function GET(request: NextRequest) {
  const auth = await authorize()
  if ('response' in auth) return auth.response
  const { supabase } = auth

  try {
    if (request.nextUrl.searchParams.get('counts') === '1') {
      const [{ count: total, error: totalError }, { data: counts, error: countsError }] = await Promise.all([
        supabase.from('contacts').select('id', { count: 'exact', head: true }),
        supabase.rpc('get_contact_list_counts'),
      ])
      if (totalError || countsError) throw totalError || countsError
      const listCounts = Object.fromEntries((counts ?? []).map((row: { list_id: number; contact_count: number }) => [Number(row.list_id), Number(row.contact_count)]))
      return NextResponse.json({ total: Number(total ?? 0), listCounts }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
    }

    const page = Math.max(1, Math.min(100000, Number(request.nextUrl.searchParams.get('page')) || 1))
    const pageSize = Math.max(10, Math.min(100, Number(request.nextUrl.searchParams.get('pageSize')) || 50))
    const listId = Number(request.nextUrl.searchParams.get('listId') || 0)
    const rawSearch = (request.nextUrl.searchParams.get('q') || '').trim().slice(0, 100)
    const search = rawSearch.replace(/[,%()\\"]/g, ' ').replace(/\s+/g, ' ').trim()
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const searchFilter = search
      ? 'nom.ilike.%' + search + '%,prenom.ilike.%' + search + '%,email.ilike.%' + search + '%,telephone.ilike.%' + search + '%,ville.ilike.%' + search + '%'
      : null
    const result = await (async () => {
      if (Number.isSafeInteger(listId) && listId > 0) {
        let filtered = supabase.from('contacts')
          .select(CONTACT_COLUMNS + ',liste_contacts!inner(liste_id)', { count: 'exact' })
          .eq('liste_contacts.liste_id', listId)
        if (searchFilter) filtered = filtered.or(searchFilter)
        return filtered.order('date_creation', { ascending: false }).range(from, to)
      }
      let filtered = supabase.from('contacts').select(CONTACT_COLUMNS, { count: 'exact' })
      if (searchFilter) filtered = filtered.or(searchFilter)
      return filtered.order('date_creation', { ascending: false }).range(from, to)
    })()
    const { data: rows, count, error } = result
    const { count: totalCount, error: totalError } = await supabase.from('contacts').select('id', { count: 'exact', head: true })
    if (error || totalError) throw error || totalError

    const contactIds = (rows ?? []).map((row) => Number(row.id)).filter(Number.isSafeInteger)
    const [{ data: links, error: linksError }, selectedCountResult] = await Promise.all([
      contactIds.length ? supabase.from('liste_contacts').select('id,liste_id,contact_id,date_ajout').in('contact_id', contactIds) : Promise.resolve({ data: [], error: null }),
      listId > 0 ? supabase.from('liste_contacts').select('contact_id', { count: 'exact', head: true }).eq('liste_id', listId) : Promise.resolve({ count: null, error: null }),
    ])
    if (linksError || selectedCountResult.error) throw linksError || selectedCountResult.error

    const contacts = (rows ?? []).map((row: any) => ({
      ...row,
      id: Number(row.id),
      created_by: Number(row.created_by ?? 0),
      liste_contacts: undefined,
    }))
    return NextResponse.json({
      contacts,
      links: (links ?? []).map((link) => ({ ...link, id: Number(link.id), liste_id: Number(link.liste_id), contact_id: Number(link.contact_id) })),
      total: Number(count ?? 0),
      totalContacts: Number(totalCount ?? 0),
      listCount: Number(selectedCountResult.count ?? 0),
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(Number(count ?? 0) / pageSize)),
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  } catch (error) {
    console.error('[contacts] paginated read failed:', error)
    return NextResponse.json({ error: 'Impossible de charger les contacts.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
