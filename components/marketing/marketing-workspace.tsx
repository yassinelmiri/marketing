
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, LayoutDashboard, LogOut, Sun, Moon } from 'lucide-react'

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
  type Contact,
  type ListeContact,
  type TypeCampagne,
  type Role,
  type ListeContactContact,
  type User,
} from '@/lib/storage'
import {
  loadMarketingData,
  createCampagne,
  updateCampagne,
  deleteCampagne,
  setCampagneListes,
  addCampagneComment,
} from '@/lib/supabase/marketing-data'

import { type ViewKey } from '@/lib/permissions'
import { resolveWorkspacePermissions } from '@/lib/permissions/workspace'
import { NAV_ITEMS, PAGE_TITLES } from './workspace-config'

import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'

export function MarketingWorkspace() {
  const router = useRouter()
  const toast = useToast()

  const supabase = useMemo(() => createClient(), [])

  const [mounted, setMounted] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [roleName, setRoleName] = useState('Membre')

  const [activeView, setActiveView] = useState<string>('dashboard')
  // Conserver les écrans déjà ouverts montés pour préserver leur état lors de la navigation.
  const [visitedViews, setVisitedViews] = useState<string[]>(['dashboard'])
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [campagnes, setCampagnes] = useState<Campagne[]>([])
  const [commentaires, setCommentaires] = useState<Commentaire[]>([])
  const [listes, setListes] = useState<ListeContact[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [typesCampagnes, setTypesCampagnes] = useState<TypeCampagne[]>([])
  const [campagneListes, setCampagneListesState] = useState<{ id: number; campagne_id: number; liste_id: number; date_ajout: string }[]>([])
  const [listeContacts, setListeContacts] = useState<ListeContactContact[]>([])
  const [teamRoles, setTeamRoles] = useState<Role[]>([])
  const [teamUsers, setTeamUsers] = useState<User[]>([])

  // ============================================================
  // INITIALISATION
  // ============================================================

  useEffect(() => {
    setMounted(true)
    try {
      const savedTheme = window.localStorage.getItem('anntel-workspace-theme')
      if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme)
    } catch {
      // Le thème reste utilisable même si le stockage local est indisponible.
    }
  }, [])

  useEffect(() => {
    if (!mounted) return
    document.documentElement.dataset.workspaceTheme = theme
    try {
      window.localStorage.setItem('anntel-workspace-theme', theme)
    } catch {
      // Le changement de thème reste actif pour la session courante.
    }
  }, [theme, mounted])

  function toggleTheme() {
    setTheme((current) => current === 'dark' ? 'light' : 'dark')
  }

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

      if (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        setAuthLoading(true)

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
    try {
      const result = await loadMarketingData()
      setCampagnes(Array.isArray(result.campagnes) ? result.campagnes : [])
      setCommentaires(Array.isArray(result.commentaires) ? result.commentaires : [])
      setListes(Array.isArray(result.listes) ? result.listes : [])
      setContacts(Array.isArray(result.contacts) ? result.contacts : [])
      setTypesCampagnes(Array.isArray(result.typesCampagnes) ? result.typesCampagnes : [])
      setCampagneListesState(Array.isArray(result.campagneListes) ? result.campagneListes : [])
      setListeContacts(Array.isArray(result.listeContacts) ? result.listeContacts : [])
      const { data: roles, error: rolesError } = await supabase.from('roles').select('id, nom, description')
      if (rolesError) throw rolesError
      setTeamRoles((roles ?? []).map((role) => ({ id: Number(role.id), nom: role.nom, description: role.description ?? '' })))

      // Les membres ne voient que leur propre profil; seul l'admin charge toute l'équipe.
      let membersQuery = supabase
        .from('user_profiles')
        .select('id, prenom, nom, email, telephone, address, role_id, date_creation')
        .order('date_creation', { ascending: false })
      if (currentUser.role_id !== 1) {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError || !authData.user) throw authError ?? new Error('Session expirée.')
        membersQuery = membersQuery.eq('auth_user_id', authData.user.id)
      }
      const { data: members, error } = await membersQuery
      if (error) throw error
      setTeamUsers((members ?? []).map((member) => ({
        id: Number(member.id),
        prenom: member.prenom ?? '',
        nom: member.nom ?? '',
        email: member.email ?? '',
        telephone: member.telephone ?? '',
        address: member.address ?? '',
        role_id: Number(member.role_id ?? 3),
        date_creation: member.date_creation,
        date_dernier_login: null,
        ip_address: null,
        permissions: [],
      })))
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

    return { total, enCours, terminees, brouillons, listes: listes.length, contacts: contacts.length, membres: teamUsers.length }
  }, [campagnes, listes.length, contacts.length, teamUsers.length])

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

  async function handleSetCampagneListes(campagneId: number, listeIds: number[]) {
    try {
      await setCampagneListes(campagneId, listeIds)
      await refresh()
    } catch (error) {
      toast.error('Affectation impossible', error instanceof Error ? error.message : 'Erreur Supabase.')
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
            <button
              type="button"
              className="workspace-theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
              title={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'}
            >
              {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
              <span>{theme === 'dark' ? 'Clair' : 'Sombre'}</span>
            </button>
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
              contacts={contacts}
              typesCampagnes={typesCampagnes}
              campagneListes={campagneListes}
              listeContacts={listeContacts}
              onCreate={handleCreateCampagne}
              onUpdate={handleUpdateCampagne}
              onDelete={handleDeleteCampagne}
              onSetListes={handleSetCampagneListes}
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
              contacts={contacts}
              campagnes={campagnes}
              campagneListes={campagneListes}
              listeContacts={listeContacts}
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
            <div hidden={activeView !== 'email'}><EmailSenderView listes={listes} listeContacts={listeContacts} isAdmin={currentUser.role_id === 1} /></div>
          )}

          {visitedViews.includes('sms') && (
            <div hidden={activeView !== 'sms'}><SmsSenderView listes={listes} listeContacts={listeContacts} /></div>
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
            <div hidden={activeView !== 'settings'}><SettingsView user={currentUser} onSaved={() => { void refresh() }} /></div>
          )}
        </div>
      </main>
    </div>
  )
}

