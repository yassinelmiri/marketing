
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Clock3, LayoutDashboard, LogOut } from 'lucide-react'

import { DashboardView } from './dashboard-view'
import { CampagnesView } from './campagnes-view'
import { ListesView } from './listes-view'
import { EquipeView } from './equipe-view'
import { AdminUsersView } from './admin-users-view'
import { WhatsAppBotView } from './whatsapp-bot-view'
import { EmailSenderView } from './email-sender-view'
import { SmsSenderView } from './sms-sender-view'
import { SettingsView } from './settings-view'
import { NotificationBell } from './notification-bell'
import { TasksView } from './tasks-view'

import {
  type Campagne,
  type Commentaire,
  type ListeContact,
  type TypeCampagne,
  type Role,
  type User,
} from '@/lib/storage'
import {
  loadMarketingData,
  createCampagne,
  updateCampagne,
  deleteCampagne,
  setCampagneListes,
  setCampagneMembres,
  addCampagneComment,
} from '@/lib/supabase/marketing-data'

import { type ViewKey } from '@/lib/permissions'
import { resolveWorkspacePermissions } from '@/lib/permissions/workspace'
import { NAV_ITEMS, PAGE_TITLES } from './workspace-config'

import { createClient } from '@/lib/supabase/client'
import { loadWorkspaceTeamData } from '@/lib/supabase/workspace-team-data'
import { useToast } from '@/components/ui/toast'

type WorkspaceProfile = {
  id: number | string
  prenom: string | null
  nom: string | null
  email: string | null
  telephone: string | null
  address: string | null
  role_id: number | string
}

export function MarketingWorkspace({ initialData = null }: { initialData?: Awaited<ReturnType<typeof import('@/lib/supabase/workspace-initial-data').loadWorkspaceInitialData>> | null }) {
  const router = useRouter()
  const toast = useToast()

  const supabase = useMemo(() => createClient(), [])

  const [mounted, setMounted] = useState(false)
  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [roleName, setRoleName] = useState('Membre')

  const [activeView, setActiveView] = useState<string>('dashboard')
  // Conserver les écrans déjà ouverts montés pour préserver leur état lors de la navigation.
  const [visitedViews, setVisitedViews] = useState<string[]>(['dashboard'])
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const initialDataHydrated = useRef(false)
  const [campagnes, setCampagnes] = useState<Campagne[]>(initialData?.campagnes ?? [])
  const [commentaires, setCommentaires] = useState<Commentaire[]>(initialData?.commentaires ?? [])
  const [listes, setListes] = useState<ListeContact[]>(initialData?.listes ?? [])
  const [contactsCount, setContactsCount] = useState(0)
  const [contactListCounts, setContactListCounts] = useState<Record<number, number>>({})
  const [typesCampagnes, setTypesCampagnes] = useState<TypeCampagne[]>(initialData?.typesCampagnes ?? [])
  const [campagneListes, setCampagneListesState] = useState<{ id: number; campagne_id: number; liste_id: number; date_ajout: string }[]>(initialData?.campagneListes ?? [])
  const [campagneMembres, setCampagneMembresState] = useState<{ id: number; campagne_id: number; user_id: number }[]>(initialData?.campagneMembres ?? [])
  const [teamRoles, setTeamRoles] = useState<Role[]>([])
  const [teamUsers, setTeamUsers] = useState<User[]>([])

  // ============================================================
  // INITIALISATION
  // ============================================================

  useEffect(() => {
    setMounted(true)
    setCurrentTime(new Date())
    const clockInterval = window.setInterval(() => setCurrentTime(new Date()), 1000)
    return () => window.clearInterval(clockInterval)
  }, [])

  // ============================================================
  // SUPABASE AUTH + USER PROFILE
  // ============================================================

  useEffect(() => {
    let active = true

    async function loadWorkspaceUser(
      authUser: { id: string; email?: string },
    ) {
      try {
        setAuthError(null)

        // 1. Récupérer le profil lié à l'utilisateur Supabase.
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select(
            'id, prenom, nom, email, telephone, address, role_id',
          )
          .eq('auth_user_id', authUser.id)
          .maybeSingle()

        if (profileError) throw profileError

        if (!profile) {
          throw new Error(
            'Profil utilisateur introuvable dans user_profiles.',
          )
        }

        const typedProfile = profile as WorkspaceProfile
        const roleId = Number(typedProfile.role_id)

        // 2. Récupérer le nom du rôle.
        const { data: role, error: roleError } = await supabase
          .from('roles')
          .select('nom')
          .eq('id', roleId)
          .maybeSingle()

        if (roleError) throw roleError

        // 3. Charger les permissions héritées du rôle et les dérogations individuelles.
        const { data: roleLinks, error: linksError } = await supabase
          .from('role_permissions')
          .select('permission_id')
          .eq('role_id', roleId)

        if (linksError) throw linksError

        const { data: userLinks, error: userLinksError } = await supabase
          .from('user_permissions')
          .select('permission_id, granted')
          .eq('user_id', Number(typedProfile.id))

        if (userLinksError) throw userLinksError

        const permissionIds = Array.from(new Set([
          ...(roleLinks ?? []).map((item) => Number(item.permission_id)),
          ...(userLinks ?? []).map((item) => Number(item.permission_id)),
        ]))

        let permissions: { id: number; code: string }[] = []
        if (permissionIds.length > 0) {
          const { data, error } = await supabase
            .from('permissions')
            .select('id, code')
            .in('id', permissionIds)
          if (error) throw error
          permissions = data ?? []
        }

        if (!active) return

        const resolvedPermissions = resolveWorkspacePermissions(
          roleId,
          roleLinks ?? [],
          userLinks ?? [],
          permissions,
        )

        // 5. Construire le User attendu par les composants existants.
        // Le mot de passe n'est jamais récupéré depuis Supabase.
        const workspaceUser: User = {
          id: Number(typedProfile.id),
          prenom: typedProfile.prenom ?? '',
          nom: typedProfile.nom ?? '',
          email: authUser.email ?? typedProfile.email ?? '',
          telephone: typedProfile.telephone ?? '',
          address: typedProfile.address ?? '',
          role_id: roleId,
          date_creation: new Date().toISOString(),
          date_dernier_login: null,
          ip_address: null,
          permissions: resolvedPermissions,
        }

        setCurrentUser(workspaceUser)
        setRoleName(role?.nom ?? 'Membre')
        setAuthError(null)
      } catch (error) {
        console.error('[Workspace] Erreur Supabase:', error)

        if (!active) return

        setCurrentUser(null)
        setAuthError(
          error instanceof Error
            ? error.message
            : 'Impossible de charger votre profil.',
        )
      } finally {
        if (active) setAuthLoading(false)
      }
    }

    async function initializeAuth() {
      const { data, error } = await supabase.auth.getUser()

      if (!active) return

      if (error || !data.user) {
        setCurrentUser(null)
        setAuthLoading(false)
        router.replace('/login')
        return
      }

      await loadWorkspaceUser({
        id: data.user.id,
        email: data.user.email,
      })
    }

    void initializeAuth()

    // Garder le Workspace synchronisé avec les changements de session.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return

      if (event === 'SIGNED_OUT' || !session?.user) {
        setCurrentUser(null)
        setAuthLoading(false)
        router.replace('/login')
        return
      }

      // Un rafraîchissement du token ne change ni le profil ni les permissions.
      // Recharger le Workspace ici faisait réapparaître l'écran de chargement
      // pendant la navigation, alors que la session était toujours valide.
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // Garder l'espace visible pendant une simple actualisation du profil.
        void loadWorkspaceUser({
          id: session.user.id,
          email: session.user.email,
        })
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [supabase, router])

  // ============================================================
  // DONNÉES MÉTIER — SUPABASE UNIQUEMENT
  // ============================================================

  async function refresh() {
    if (!currentUser) return

    const useInitialData = Boolean(initialData) && !initialDataHydrated.current
    if (useInitialData) initialDataHydrated.current = true

    const marketingPromise = useInitialData ? Promise.resolve(null) : loadMarketingData()
    const contactsCountPromise = fetch('/api/contacts?counts=1', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'Statistiques des contacts indisponibles.')
        return data as { total?: number; listCounts?: Record<number, number> }
      })
      .catch((error) => {
        console.error('[Workspace] Erreur pendant le chargement des statistiques des contacts:', error)
        return null
      })

    try {
      const [marketingData, countData, teamData] = await Promise.all([
        marketingPromise,
        contactsCountPromise,
        loadWorkspaceTeamData(supabase, currentUser),
      ])

      if (marketingData) {
        setCampagnes(Array.isArray(marketingData.campagnes) ? marketingData.campagnes : [])
        setCommentaires(Array.isArray(marketingData.commentaires) ? marketingData.commentaires : [])
        setListes(Array.isArray(marketingData.listes) ? marketingData.listes : [])
        setTypesCampagnes(Array.isArray(marketingData.typesCampagnes) ? marketingData.typesCampagnes : [])
        setCampagneListesState(Array.isArray(marketingData.campagneListes) ? marketingData.campagneListes : [])
        setCampagneMembresState(Array.isArray(marketingData.campagneMembres) ? marketingData.campagneMembres : [])
      }

      if (countData) {
        setContactsCount(Number(countData.total ?? 0))
        setContactListCounts(countData.listCounts ?? {})
      }

      setTeamRoles(teamData.roles)
      setTeamUsers(teamData.users)
    } catch (error) {
      toast.error('Erreur de chargement', error instanceof Error ? error.message : 'Impossible de charger les données.')
    }
  }

  useEffect(() => {
    if (currentUser) void refresh()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id])

  // ============================================================
  // STATISTIQUES
  // ============================================================

  const stats = useMemo(() => {
    const total = campagnes.length
    const enCours = campagnes.filter(
      (campagne) => campagne.status === 'en_cours',
    ).length
    const terminees = campagnes.filter(
      (campagne) => campagne.status === 'terminee',
    ).length
    const brouillons = campagnes.filter(
      (campagne) => campagne.status === 'brouillon',
    ).length

    return { total, enCours, terminees, brouillons, listes: listes.length, contacts: contactsCount, membres: teamUsers.length }
  }, [campagnes, listes.length, contactsCount, teamUsers.length])

  // ============================================================
  // NAVIGATION & PERMISSIONS
  // ============================================================

  const isAdmin = currentUser?.role_id === 1

  const visibleNav = useMemo(() => {
    if (!currentUser) return []

    return NAV_ITEMS.filter((item) => {
      if (isAdmin) return true

      if (item.adminOnly) return false

      return currentUser.permissions.includes(item.key as ViewKey)
    })
  }, [currentUser, isAdmin])

  // Si l'utilisateur n'a plus accès à une page, revenir au dashboard.
  useEffect(() => {
    if (!currentUser) return

    const allowed = visibleNav.some(
      (item) => item.key === activeView,
    )

    if (!allowed) {
      setActiveView('dashboard')
    }
  }, [currentUser, visibleNav, activeView])

  const currentPage = PAGE_TITLES[activeView] ?? PAGE_TITLES.dashboard

  const userName = currentUser
    ? `${currentUser.prenom} ${currentUser.nom}`.trim()
    : 'Invité'

  // ============================================================
  // CAMPAGNES
  // ============================================================

  async function handleCreateCampagne(
    data: Omit<Campagne, 'id' | 'user_id' | 'date_creation' | 'date_modification'>,
  ): Promise<Campagne | null> {
    if (!currentUser) return null
    try {
      const created = await createCampagne({ ...data, user_id: currentUser.id })
      await refresh()
      return created
    } catch (error) {
      toast.error('Création impossible', error instanceof Error ? error.message : 'Erreur Supabase.')
      return null
    }
  }

  async function handleUpdateCampagne(
    id: number,
    patch: Partial<Pick<Campagne, 'type_campagne_id' | 'titre' | 'cible' | 'note' | 'status'>>,
  ) {
    try {
      await updateCampagne(id, patch)
      await refresh()
    } catch (error) {
      toast.error('Modification impossible', error instanceof Error ? error.message : 'Erreur Supabase.')
    }
  }

  async function handleDeleteCampagne(id: number) {
    try {
      await deleteCampagne(id)
      await refresh()
    } catch (error) {
      toast.error('Suppression impossible', error instanceof Error ? error.message : 'Erreur Supabase.')
    }
  }

  async function handleSetCampagneMembres(campagneId: number, userIds: number[]) {
    try {
      await setCampagneMembres(campagneId, userIds)
      await refresh()
    } catch (error) {
      toast.error('Affectation des membres impossible', error instanceof Error ? error.message : 'Erreur Supabase.')
    }
  }

  async function handleSetCampagneListes(campagneId: number, listeIds: number[]) {
    try {
      await setCampagneListes(campagneId, listeIds)
      await refresh()
    } catch (error) {
      toast.error('Affectation impossible', error instanceof Error ? error.message : 'Erreur Supabase.')
      throw error
    }
  }

  async function handleAddComment(campagneId: number, contenu: string) {
    if (!currentUser) return
    try {
      await addCampagneComment(campagneId, currentUser.id, contenu)
      await refresh()
    } catch (error) {
      toast.error('Commentaire non publié', error instanceof Error ? error.message : 'Erreur Supabase.')
    }
  }

  // ============================================================
  // DÉCONNEXION SUPABASE
  // ============================================================

  async function handleLogout() {
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('[Workspace] Erreur déconnexion:', error)

      toast.error(
        'Déconnexion impossible',
        error.message,
      )

      return
    }

    setCurrentUser(null)

    toast.info(
      'Déconnexion',
      'Vous êtes déconnecté.',
    )

    router.replace('/login')
  }

  // ============================================================
  // ÉTATS DE CHARGEMENT
  // ============================================================

  if (!mounted || authLoading) {
    return (
      <div className="workspace-root">
        <aside className="workspace-sidebar">
          <div className="workspace-brand">
            <span className="workspace-brand-mark">
              <span />
              <span />
            </span>

            <span className="workspace-brand-name">
              anntel<span>marketing</span>
            </span>
          </div>
        </aside>

        <main className="workspace-main">
          <div className="workspace-content">
            <p style={{ padding: '2rem', color: '#64748b' }}>
              Chargement de votre espace…
            </p>
          </div>
        </main>
      </div>
    )
  }

  // ============================================================
  // ERREUR DE PROFIL
  // ============================================================

  if (authError || !currentUser) {
    return (
      <div className="workspace-root">
        <main
          className="workspace-main"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
          }}
        >
          <div
            className="workspace-panel"
            style={{ maxWidth: '520px', width: '100%', padding: '2rem' }}
          >
            <h2>Impossible de charger votre espace</h2>

            <p style={{ color: '#64748b', marginTop: '1rem' }}>
              {authError ?? 'Utilisateur non connecté.'}
            </p>

            <button
              type="button"
              className="workspace-logout"
              style={{ marginTop: '1.5rem' }}
              onClick={handleLogout}
            >
              <LogOut aria-hidden="true" />
              <span>Se déconnecter</span>
            </button>
          </div>
        </main>
      </div>
    )
  }

  // ============================================================
  // WORKSPACE
  // ============================================================

  return (
    <div className="workspace-root">
      {mobileNavOpen && (
        <button
          type="button"
          className="workspace-overlay"
          aria-label="Fermer la navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`workspace-sidebar${mobileNavOpen ? ' is-open' : ''}`}
      >
        <div className="workspace-brand">
          <span className="workspace-brand-mark">
            <span />
            <span />
          </span>

          <span className="workspace-brand-name">
            anntel<span>marketing</span>
          </span>
        </div>

        <div className="workspace-user">
          <span className="workspace-user-avatar">
            {currentUser.prenom?.charAt(0).toUpperCase() ?? '?'}
            {currentUser.nom?.charAt(0).toUpperCase() ?? ''}
          </span>

          <div>
            <strong>{userName}</strong>
            <span>{roleName}</span>
          </div>

          <ChevronDown aria-hidden="true" />
        </div>

        <nav
          className="workspace-nav"
          aria-label="Navigation principale"
        >
          {visibleNav.map((item) => {
            const Icon = item.icon
            const active = activeView === item.key

            return (
              <button
                key={item.key}
                type="button"
                className={`workspace-nav-item${active ? ' is-active' : ''}`}
                onClick={() => {
                  setActiveView(item.key)
                  setVisitedViews((current) => current.includes(item.key) ? current : [...current, item.key])
                  setMobileNavOpen(false)
                }}
                aria-current={active ? 'page' : undefined}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="workspace-sidebar-footer">
          <div className="workspace-live-clock" aria-label="Heure actuelle au Maroc" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 14px', marginBottom: '12px', borderRadius: '14px', background: 'rgba(139, 92, 246, 0.09)', border: '1px solid rgba(139, 92, 246, 0.16)' }}>
            <span style={{ width: '36px', height: '36px', display: 'grid', placeItems: 'center', flexShrink: 0, borderRadius: '11px', color: '#a78bfa', background: 'rgba(139, 92, 246, 0.15)' }}>
              <Clock3 size={18} aria-hidden="true" />
            </span>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-foreground, #94a3b8)' }}>Heure actuelle</span>
              <strong style={{ fontSize: '20px', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground, #f8fafc)' }}>
                {currentTime ? currentTime.toLocaleTimeString('fr-FR', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}
              </strong>
              <span style={{ fontSize: '11px', textTransform: 'capitalize', color: 'var(--muted-foreground, #94a3b8)' }}>
                {currentTime ? currentTime.toLocaleDateString('fr-FR', { timeZone: 'Africa/Casablanca', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : 'Chargement…'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="workspace-logout"
            onClick={handleLogout}
          >
            <LogOut aria-hidden="true" />
            <span>Se déconnecter</span>
          </button>
        </div>
      </aside>

      <main className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-topbar-left">
            <button
              type="button"
              className="workspace-menu-toggle"
              aria-label="Ouvrir la navigation"
              onClick={() => setMobileNavOpen((value) => !value)}
            >
              <LayoutDashboard aria-hidden="true" />
            </button>

            <div>
              <h1>{currentPage.title}</h1>
              <p>{currentPage.subtitle}</p>
            </div>
          </div>
          <div className="workspace-topbar-actions">
            <NotificationBell userId={currentUser.id} />
            <div className="workspace-topbar-user"><span>{userName}</span><small>{roleName}</small></div>
          </div>
        </header>

        <div className="workspace-content">
          {visitedViews.includes('dashboard') && (
            <div hidden={activeView !== 'dashboard'}>
            <DashboardView
              user={currentUser}
              typesCampagnes={typesCampagnes}
              teamUsers={teamUsers}
              stats={stats}
              campagnes={campagnes}
              campagneMembres={campagneMembres}
              commentaires={commentaires}
              onAddComment={handleAddComment}
            />
            </div>
          )}

          {visitedViews.includes('campagnes') && (
            <div hidden={activeView !== 'campagnes'}>
            <CampagnesView
              user={currentUser}
              campagnes={campagnes}
              listes={listes}
              typesCampagnes={typesCampagnes}
              campagneListes={campagneListes}
              teamUsers={teamUsers}
              campagneMembres={campagneMembres}
              onSetMembres={handleSetCampagneMembres}
              onCreate={handleCreateCampagne}
              onUpdate={handleUpdateCampagne}
              onDelete={handleDeleteCampagne}
              onOpenListes={() => {
                setActiveView('listes')
                setVisitedViews((current) => current.includes('listes') ? current : [...current, 'listes'])
              }}
            />
            </div>
          )}

          {visitedViews.includes('listes') && (
            <div hidden={activeView !== 'listes'}>
            <ListesView
              user={currentUser}
              listes={listes}
              campagnes={campagnes}
              campagneListes={campagneListes}
              campagneMembres={campagneMembres}
              contactCount={contactsCount}
              contactListCounts={contactListCounts}
              teamUsers={teamUsers}
              onRefresh={refresh}
            />
            </div>
          )}

          {visitedViews.includes('equipe') && (
            <div hidden={activeView !== 'equipe'}>
            <EquipeView user={currentUser} team={teamUsers} roles={teamRoles} />
            </div>
          )}

          {visitedViews.includes('tasks') && (
            <div hidden={activeView !== 'tasks'}><TasksView user={currentUser} isAdmin={isAdmin} /></div>
          )}

          {visitedViews.includes('whatsapp') && (
            <div hidden={activeView !== 'whatsapp'}><WhatsAppBotView /></div>
          )}

          {visitedViews.includes('email') && (
            <div hidden={activeView !== 'email'}><EmailSenderView listes={listes} contactListCounts={contactListCounts} isAdmin={currentUser.role_id === 1} /></div>
          )}

          {visitedViews.includes('sms') && (
            <div hidden={activeView !== 'sms'}><SmsSenderView listes={listes} contactListCounts={contactListCounts} /></div>
          )}

          {visitedViews.includes('admin-users') && (
            <div hidden={activeView !== 'admin-users'}>
            <AdminUsersView
              currentUser={currentUser}
              onChange={refresh}
            />
            </div>
          )}

          {visitedViews.includes('settings') && (
            <div hidden={activeView !== 'settings'}><SettingsView user={currentUser} isAdmin={isAdmin} onSaved={() => { void refresh() }} /></div>
          )}
        </div>
      </main>
    </div>
  )
}

