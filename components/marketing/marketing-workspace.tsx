'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Mail,
  Settings,
  ShieldCheck,
  Smartphone,
  Users,
  UsersRound,
} from 'lucide-react'

import { DashboardView } from './dashboard-view'
import { CampagnesView } from './campagnes-view'
import { ListesView } from './listes-view'
import { EquipeView } from './equipe-view'
import { AdminUsersView } from './admin-users-view'
import { WhatsAppBotView } from './whatsapp-bot-view'
import { EmailSenderView } from './email-sender-view'
import { SmsSenderView } from './sms-sender-view'

import {
  campagnesRepo,
  commentairesRepo,
  contactsRepo,
  listesRepo,
  logoutUser,
  rolesRepo,
  sessionRepo,
  usersRepo,
  type Campagne,
  type Commentaire,
  type Contact,
  type ListeContact,
  type User,
} from '@/lib/storage'
import { GRANTABLE_PAGES, type ViewKey } from '@/lib/permissions'
import { useToast } from '@/components/ui/toast'

type NavigationItem = {
  key: ViewKey | 'listes'
  label: string
  icon: typeof LayoutDashboard
  adminOnly?: boolean
}

const NAV_ITEMS: NavigationItem[] = [
  { key: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { key: 'campagnes', label: 'Campagnes', icon: BarChart3 },
  { key: 'listes', label: 'Listes & contacts', icon: Users },
  { key: 'equipe', label: 'Équipe', icon: UsersRound },
  { key: 'whatsapp', label: 'Bot WhatsApp', icon: MessageCircle },
  { key: 'email', label: 'E-mail', icon: Mail },
  { key: 'sms', label: 'SMS', icon: Smartphone },
  { key: 'admin-users', label: 'Utilisateurs', icon: ShieldCheck, adminOnly: true },
  { key: 'settings', label: 'Paramètres', icon: Settings, adminOnly: true },
]

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: 'Tableau de bord', subtitle: 'Vue d’ensemble des campagnes.' },
  campagnes: { title: 'Campagnes', subtitle: 'Créez et suivez vos campagnes multicanal.' },
  listes: { title: 'Listes & contacts', subtitle: 'Organisez vos contacts par liste.' },
  equipe: { title: 'Équipe', subtitle: 'Membres de votre espace.' },
  whatsapp: { title: 'Bot WhatsApp', subtitle: 'Simulation d’envoi WhatsApp.' },
  email: { title: 'Envoi e-mail', subtitle: 'Simulation d’envoi e-mail.' },
  sms: { title: 'Envoi SMS', subtitle: 'Simulation d’envoi SMS.' },
  'admin-users': { title: 'Administration', subtitle: 'Utilisateurs et permissions.' },
  settings: { title: 'Paramètres', subtitle: 'Configuration de l’espace.' },
}

export function MarketingWorkspace() {
  const toast = useToast()
  const [mounted, setMounted] = useState(false)

  const [activeView, setActiveView] = useState<string>('dashboard')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  function refresh() {
    setVersion((v) => v + 1)
  }

  const currentUser = useMemo<User | null>(() => {
    void version
    if (!mounted) return null
    return sessionRepo.currentUser()
  }, [version, mounted])

  const campagnes = useMemo<Campagne[]>(() => {
    void version
    if (!mounted) return []
    return campagnesRepo.all()
  }, [version, mounted])

  const commentaires = useMemo<Commentaire[]>(() => {
    void version
    if (!mounted) return []
    return commentairesRepo.all()
  }, [version, mounted])

  const listes = useMemo<ListeContact[]>(() => {
    void version
    if (!mounted) return []
    return listesRepo.all()
  }, [version, mounted])

  const contacts = useMemo<Contact[]>(() => {
    void version
    if (!mounted) return []
    return contactsRepo.all()
  }, [version, mounted])

  const stats = useMemo(() => {
    const total = campagnes.length
    const enCours = campagnes.filter((c) => c.status === 'en_cours').length
    const terminees = campagnes.filter((c) => c.status === 'terminee').length
    const brouillons = campagnes.filter((c) => c.status === 'brouillon').length
    return { total, enCours, terminees, brouillons }
  }, [campagnes])

  const visibleNav = useMemo(() => {
    if (!currentUser) return NAV_ITEMS
    const isSuper = usersRepo.isAdmin(currentUser)
    return NAV_ITEMS.filter((item) => {
      if (isSuper) return true
      if (item.adminOnly) return false
      if (item.key === 'listes') return currentUser.permissions.includes('campagnes')
      return currentUser.permissions.includes(item.key as ViewKey)
    })
  }, [currentUser])

  const currentPage = PAGE_TITLES[activeView] ?? PAGE_TITLES.dashboard
  const userRole = currentUser ? rolesRepo.byId(currentUser.role_id) : null
  const userName = currentUser ? `${currentUser.prenom} ${currentUser.nom}`.trim() : 'Invité'

  // ── Campagnes ─────────────────────────────────────────
  function handleCreateCampagne(
    data: Omit<Campagne, 'id' | 'user_id' | 'date_creation' | 'date_modification'>,
  ): Campagne | null {
    if (!currentUser) return null
    const created = campagnesRepo.create({ ...data, user_id: currentUser.id })
    refresh()
    return created
  }

  function handleUpdateCampagne(
    id: number,
    patch: Partial<Omit<Campagne, 'id' | 'user_id' | 'date_creation'>>,
  ) {
    campagnesRepo.update(id, patch)
    refresh()
  }

  function handleDeleteCampagne(id: number) {
    campagnesRepo.remove(id)
    refresh()
  }

  function handleSetCampagneListes(campagneId: number, listeIds: number[]) {
    const current = campagnesRepo.listesOf(campagneId).map((l) => l.id)
    for (const id of current) {
      if (!listeIds.includes(id)) campagnesRepo.detachListe(campagneId, id)
    }
    for (const id of listeIds) {
      if (!current.includes(id)) campagnesRepo.attachListe(campagneId, id)
    }
    refresh()
  }

  function handleAddComment(campagneId: number, contenu: string) {
    if (!currentUser) return
    commentairesRepo.create({ campagne_id: campagneId, user_id: currentUser.id, contenu })
    refresh()
  }

  function handleLogout() {
    logoutUser()
    toast.info('Déconnexion', 'Vous êtes déconnecté.')
    window.location.href = '/login'
  }

  if (!mounted) {
    return (
      <div className="workspace-root">
        <aside className="workspace-sidebar">
          <div className="workspace-brand">
            <span className="workspace-brand-mark"><span /><span /></span>
            <span className="workspace-brand-name">anntel<span>marketing</span></span>
          </div>
        </aside>
        <main className="workspace-main">
          <div className="workspace-content">
            <p style={{ padding: '2rem', color: '#64748b' }}>Chargement de l’espace…</p>
          </div>
        </main>
      </div>
    )
  }

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

      <aside className={`workspace-sidebar${mobileNavOpen ? ' is-open' : ''}`}>
        <div className="workspace-brand">
          <span className="workspace-brand-mark"><span /><span /></span>
          <span className="workspace-brand-name">anntel<span>marketing</span></span>
        </div>

        <div className="workspace-user">
          <span className="workspace-user-avatar">
            {currentUser?.prenom?.charAt(0).toUpperCase() ?? '?'}
            {currentUser?.nom?.charAt(0).toUpperCase() ?? ''}
          </span>
          <div>
            <strong>{userName}</strong>
            <span>{userRole?.nom ?? 'Membre'}</span>
          </div>
          <ChevronDown aria-hidden="true" />
        </div>

        <nav className="workspace-nav" aria-label="Navigation principale">
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
          <button type="button" className="workspace-logout" onClick={handleLogout}>
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
              onClick={() => setMobileNavOpen((v) => !v)}
            >
              <LayoutDashboard aria-hidden="true" />
            </button>
            <div>
              <h1>{currentPage.title}</h1>
              <p>{currentPage.subtitle}</p>
            </div>
          </div>
        </header>

        <div className="workspace-content">
          {activeView === 'dashboard' && currentUser && (
            <DashboardView
              user={currentUser}
              stats={stats}
              campagnes={campagnes}
              commentaires={commentaires}
              onAddComment={handleAddComment}
            />
          )}

          {activeView === 'campagnes' && currentUser && (
            <CampagnesView
              user={currentUser}
              campagnes={campagnes}
              onCreate={handleCreateCampagne}
              onUpdate={handleUpdateCampagne}
              onDelete={handleDeleteCampagne}
              onSetListes={handleSetCampagneListes}
              onOpenListes={() => setActiveView('listes')}
            />
          )}

          {activeView === 'listes' && currentUser && (
            <ListesView
              user={currentUser}
              listes={listes}
              contacts={contacts}
              onRefresh={refresh}
            />
          )}

          {activeView === 'equipe' && currentUser && <EquipeView user={currentUser} />}
          {activeView === 'whatsapp' && <WhatsAppBotView />}
          {activeView === 'email' && <EmailSenderView />}
          {activeView === 'sms' && <SmsSenderView />}

          {activeView === 'admin-users' && currentUser && (
            <AdminUsersView currentUser={currentUser} onChange={refresh} />
          )}

          {activeView === 'settings' && <SettingsView />}
        </div>
      </main>
    </div>
  )
}

function SettingsView() {
  return (
    <section className="workspace-section">
      <div className="workspace-panel">
        <div className="workspace-panel-header">
          <h2>Paramètres</h2>
        </div>
        <div className="workspace-empty">
          <Settings aria-hidden="true" />
          <p>Configuration à venir</p>
          <span>La configuration sera disponible après intégration du backend.</span>
        </div>
      </div>
    </section>
  )
}