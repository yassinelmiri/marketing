'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useToast } from '@/components/ui/toast'
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  MessageCircle,
  Pencil,
  X,
  UsersRound,
  ContactRound,
  ListChecks,
  Activity,
  TrendingUp,
  Target,
  Sparkles,
  Mail,
  ListTodo,
  AlertCircle,
} from 'lucide-react'
import {
  type Campagne,
  type Commentaire,
  type User,
  type Role,
  type TypeCampagne,
} from '@/lib/storage'
import { formatDate, STATUS_COLORS, STATUS_LABELS } from './shared'

interface DashboardViewProps {
  user: User
  stats: { total: number; enCours: number; terminees: number; brouillons: number; listes: number; contacts: number; membres: number }
  campagnes: Campagne[]
  campagneMembres: { id: number; campagne_id: number; user_id: number }[]
  commentaires: Commentaire[]
  typesCampagnes: TypeCampagne[]
  teamUsers: User[]
  teamRoles: Role[]
  onAddComment: (campagneId: number, contenu: string) => void
}

export function DashboardView({
  user,
  stats,
  campagnes,
  campagneMembres,
  commentaires,
  typesCampagnes,
  teamUsers,
  teamRoles,
  onAddComment,
}: DashboardViewProps) {
  const toast = useToast()
  const isAdmin = Number(user.role_id) === 1
  const [selectedCampagneId, setSelectedCampagneId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [moduleStats, setModuleStats] = useState<{
    email: { campaigns: number; sent: number; failed: number; opened: number; clicked: number; running: number; todaySent: number; yesterdaySent: number; loaded: boolean }
    whatsapp: { campaigns: number; recipients: number; sent: number; failed: number; running: number; todaySent: number; yesterdaySent: number; loaded: boolean }
    tasks: { total: number; open: number; done: number; late: number; loaded: boolean }
  }>({
    email: { campaigns: 0, sent: 0, failed: 0, opened: 0, clicked: 0, running: 0, todaySent: 0, yesterdaySent: 0, loaded: false },
    whatsapp: { campaigns: 0, recipients: 0, sent: 0, failed: 0, running: 0, todaySent: 0, yesterdaySent: 0, loaded: false },
    tasks: { total: 0, open: 0, done: 0, late: 0, loaded: false },
  })
  const [moduleError, setModuleError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [systemHealth, setSystemHealth] = useState<{
    database: { totalRows: number; tables: { name: string; rows: number | null; available: boolean }[]; checkedAt: string } | null
    website: { responseMs: number | null; status: 'online' | 'slow' | 'offline'; checkedAt: string } | null
    alerts: { level: 'warning' | 'error'; title: string; detail: string }[]
  }>({ database: null, website: null, alerts: [] })
  const [healthLoading, setHealthLoading] = useState(false)
  const [speedHistory, setSpeedHistory] = useState<{ time: string; ms: number }[]>([])

  useEffect(() => {
    if (!isAdmin) return
    let active = true
    const loadModules = async () => {
      const [emailResult, whatsappResult, tasksResult] = await Promise.allSettled([
        fetch('/api/email/send', { cache: 'no-store' }).then(async (response) => {
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || 'Email indisponible')
          return data
        }),
        fetch('/api/whatsapp/campaigns', { cache: 'no-store' }).then(async (response) => {
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || 'WhatsApp indisponible')
          return data
        }),
        fetch('/api/tasks', { cache: 'no-store' }).then(async (response) => {
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || 'Tâches indisponibles')
          return data
        }),
      ])
      if (!active) return
      const emailCampaigns = emailResult.status === 'fulfilled' ? (emailResult.value.campaigns ?? []) : []
      const whatsappCampaigns = whatsappResult.status === 'fulfilled' ? (whatsappResult.value.campaigns ?? []) : []
      const tasks = tasksResult.status === 'fulfilled' ? (tasksResult.value.tasks ?? []) : []
      setModuleStats({
        email: {
          campaigns: emailCampaigns.length,
          sent: emailCampaigns.reduce((sum: number, item: { sent_count?: number }) => sum + Number(item.sent_count || 0), 0),
          failed: emailCampaigns.reduce((sum: number, item: { failed_count?: number }) => sum + Number(item.failed_count || 0), 0),
          opened: emailCampaigns.reduce((sum: number, item: { open_count?: number }) => sum + Number(item.open_count || 0), 0),
          clicked: emailCampaigns.reduce((sum: number, item: { click_count?: number }) => sum + Number(item.click_count || 0), 0),
          running: emailCampaigns.filter((item: { status?: string }) => ['sending', 'processing', 'running'].includes(String(item.status))).length,
          todaySent: Number(emailResult.status === 'fulfilled' ? emailResult.value.daily_stats?.today_sent ?? 0 : 0),
          yesterdaySent: Number(emailResult.status === 'fulfilled' ? emailResult.value.daily_stats?.yesterday_sent ?? 0 : 0),
          loaded: emailResult.status === 'fulfilled',
        },
        whatsapp: {
          campaigns: whatsappCampaigns.length,
          recipients: whatsappCampaigns.reduce((sum: number, item: { total_recipients?: number }) => sum + Number(item.total_recipients || 0), 0),
          sent: whatsappCampaigns.reduce((sum: number, item: { counts?: { sent?: number } }) => sum + Number(item.counts?.sent || 0), 0),
          failed: whatsappCampaigns.reduce((sum: number, item: { counts?: { failed?: number } }) => sum + Number(item.counts?.failed || 0), 0),
          running: whatsappCampaigns.filter((item: { status?: string }) => item.status === 'in_progress').length,
          todaySent: Number(whatsappResult.status === 'fulfilled' ? whatsappResult.value.daily_stats?.today_sent ?? 0 : 0),
          yesterdaySent: Number(whatsappResult.status === 'fulfilled' ? whatsappResult.value.daily_stats?.yesterday_sent ?? 0 : 0),
          loaded: whatsappResult.status === 'fulfilled',
        },
        tasks: {
          total: tasks.length,
          open: tasks.filter((item: { status?: string }) => item.status !== 'done').length,
          done: tasks.filter((item: { status?: string }) => item.status === 'done').length,
          late: tasks.filter((item: { status?: string; due_date?: string | null }) => item.status !== 'done' && item.due_date && new Date(String(item.due_date) + 'T23:59:59').getTime() < Date.now()).length,
          loaded: tasksResult.status === 'fulfilled',
        },
      })
      const failures = [emailResult, whatsappResult, tasksResult].filter((result) => result.status === 'rejected').length
      setModuleError(failures ? `${failures} module(s) n'ont pas pu charger leurs statistiques selon vos accès.` : '')
      setLastUpdated(new Date())
    }
    void loadModules()
    const interval = window.setInterval(() => void loadModules(), 60000)
    return () => { active = false; window.clearInterval(interval) }
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    let active = true
    const loadHealth = async () => {
      setHealthLoading(true)
      try {
        const response = await fetch('/api/admin/health', { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Diagnostic système indisponible')
        if (active) {
          setSystemHealth(data)
          if (typeof data.website?.responseMs === 'number') {
            setSpeedHistory((history) => [
              ...history,
              { time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), ms: data.website.responseMs },
            ].slice(-30))
          }
        }
      } catch (error) {
        if (active) setSystemHealth((current) => ({
          ...current,
          alerts: [{ level: 'error', title: 'Diagnostic indisponible', detail: error instanceof Error ? error.message : 'Impossible de vérifier le système.' }],
        }))
      } finally {
        if (active) setHealthLoading(false)
      }
    }
    void loadHealth()
    const interval = window.setInterval(() => void loadHealth(), 60000)
    return () => { active = false; window.clearInterval(interval) }
  }, [isAdmin])

  const selectedCampagne = campagnes.find((c) => c.id === selectedCampagneId) ?? null
  const assignedCampaignIds = useMemo(
    () => new Set(campagneMembres.filter((link) => link.user_id === user.id).map((link) => link.campagne_id)),
    [campagneMembres, user.id],
  )
  const typeNameById = useMemo(() => new Map(typesCampagnes.map((type) => [type.id, type.nom])), [typesCampagnes])
  const associatedCampaigns = useMemo(
    () => campagnes.filter((campaign) => assignedCampaignIds.has(campaign.id)),
    [campagnes, assignedCampaignIds],
  )
  const diagnostic = useMemo(() => {
    const total = campagnes.length
    const active = campagnes.filter((c) => c.status === 'en_cours').length
    const completed = campagnes.filter((c) => c.status === 'terminee').length
    const drafts = campagnes.filter((c) => c.status === 'brouillon').length
    const archived = campagnes.filter((c) => c.status === 'archivee').length
    const completionRate = total ? Math.round((completed / total) * 100) : 0
    const activeRate = total ? Math.round((active / total) * 100) : 0
    const commentsCount = commentaires.length
    const recentCampaigns = campagnes.filter((c) => {
      const date = new Date(c.date_modification).getTime()
      return Number.isFinite(date) && Date.now() - date <= 30 * 24 * 60 * 60 * 1000
    }).length
    const health = total === 0 ? 0 : Math.min(100, Math.round(
      (completionRate * 0.45) + (Math.min(recentCampaigns / total, 1) * 25) + (Math.min(commentsCount / total, 1) * 15) + (Math.min(stats.contacts / Math.max(stats.listes, 1) / 10, 1) * 15),
    ))
    const findings: { tone: 'good' | 'warn' | 'info'; title: string; detail: string }[] = []
    if (!total) findings.push({ tone: 'info', title: 'Démarrage du projet', detail: 'Aucune campagne encore créée. Créez une campagne pour commencer à suivre les performances.' })
    else if (drafts > active + completed) findings.push({ tone: 'warn', title: 'Beaucoup de campagnes en préparation', detail: `${drafts} brouillon(s) : pensez à les planifier ou à les lancer.` })
    else findings.push({ tone: 'good', title: 'Pipeline de campagnes', detail: `${active} campagne(s) en cours et ${completed} terminée(s) sur ${total} au total.` })
    if (stats.contacts === 0) findings.push({ tone: 'warn', title: 'Base de contacts vide', detail: 'Importez ou ajoutez des contacts pour alimenter les campagnes.' })
    else if (stats.listes === 0) findings.push({ tone: 'warn', title: 'Aucune liste de contacts', detail: 'Créez des listes pour segmenter la base et associer les contacts aux campagnes.' })
    else findings.push({ tone: 'good', title: 'Base de données marketing', detail: `${stats.contacts.toLocaleString('fr-FR')} contact(s) répartis sur ${stats.listes} liste(s).` })
    if (commentsCount === 0 && total > 0) findings.push({ tone: 'info', title: 'Collaboration à renforcer', detail: 'Aucun commentaire : utilisez les commentaires de campagne pour centraliser les échanges.' })
    else if (commentsCount > 0) findings.push({ tone: 'good', title: 'Suivi collaboratif', detail: `${commentsCount} commentaire(s) pour garder le contexte et les décisions.` })
    return { total, active, completed, drafts, archived, completionRate, activeRate, recentCampaigns, health, findings }
  }, [campagnes, commentaires, stats.contacts, stats.listes])

  const dashboardCampaigns = useMemo(
    () => isAdmin ? campagnes : campagnes.filter((campaign) => campaign.user_id === user.id || assignedCampaignIds.has(campaign.id)),
    [campagnes, isAdmin, user.id, assignedCampaignIds],
  )

  const selectedComments = useMemo(
    () => commentaires.filter((comment) => comment.campagne_id === selectedCampagneId),
    [commentaires, selectedCampagneId],
  )

  const recent = useMemo(
    () =>
      [...dashboardCampaigns]
        .sort((a, b) => (a.date_modification < b.date_modification ? 1 : -1))
        .slice(0, 5),
    [dashboardCampaigns],
  )

  return (
    <section className="workspace-section dashboard-page">
      <div className="dashboard-welcome">
        <div>
          <span className="settings-eyebrow">VOTRE ESPACE DE PILOTAGE</span>
          <h2>Bonjour {user.prenom} 👋</h2>
          <p>{isAdmin ? 'Vue d’ensemble de toutes les équipes et de tous les canaux marketing.' : 'Votre espace personnel pour préparer, analyser et suivre vos campagnes.'}</p>
        </div>
        <div className="dashboard-date-chip"><CalendarDays aria-hidden="true" /> Espace de travail</div>
      </div>

      {isAdmin ? <section className="kpi-command-center">
        <div className="kpi-command-header">
          <div><span className="settings-eyebrow">CENTRE DE PILOTAGE</span><h2>Performance globale du projet</h2><p>Vue consolidée des modules Marketing, mise à jour automatiquement.</p></div>
          <div className="kpi-refresh-label"><span className="kpi-pulse-dot"/>{lastUpdated ? `Actualisé à ${lastUpdated.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}` : 'Chargement des modules…'}</div>
        </div>
        {moduleError && <div className="kpi-module-notice"><AlertCircle size={15}/>{moduleError}</div>}
        <div className="kpi-main-grid">
          <article className="kpi-main-panel kpi-campaign-activity">
            <div className="kpi-panel-title"><div><strong>Campagnes Marketing</strong><span>Répartition par statut</span></div><BarChart3/></div>
            <div className="kpi-chart-total"><strong>{campagnes.length}</strong><span>campagnes CRM</span></div>
            <div className="kpi-bars">
              {[
                { label: 'En cours', value: campagnes.filter((item) => item.status === 'en_cours').length, color: 'cyan' },
                { label: 'Terminées', value: campagnes.filter((item) => item.status === 'terminee').length, color: 'green' },
                { label: 'Brouillons', value: campagnes.filter((item) => item.status === 'brouillon').length, color: 'violet' },
                { label: 'Archivées', value: campagnes.filter((item) => item.status === 'archivee').length, color: 'slate' },
              ].map((item) => <div className="kpi-bar-row" key={item.label}><span>{item.label}</span><div><i className={item.color} style={{width: `${campagnes.length ? Math.max(3, item.value / campagnes.length * 100) : 0}%`}}/></div><strong>{item.value}</strong></div>)}
            </div>
          </article>
          <article className="kpi-main-panel kpi-alert-panel">
            <div className="kpi-panel-title"><div><strong>Points à surveiller</strong><span>Diagnostic opérationnel</span></div><Activity/></div>
            {[
              { label: 'Campagnes en brouillon', value: diagnostic.drafts, warning: diagnostic.drafts > 0 },
              { label: 'Tâches en retard', value: moduleStats.tasks.late, warning: moduleStats.tasks.late > 0 },
              { label: 'Échecs e-mail', value: moduleStats.email.failed, warning: moduleStats.email.failed > 0 },
            ].map((item) => <div className="kpi-alert-row" key={item.label}><span className={item.warning ? 'warning' : 'ok'}/><span>{item.label}</span><strong>{item.value}</strong></div>)}
            <div className="kpi-alert-foot">{diagnostic.health >= 70 ? 'Votre organisation est globalement bien suivie.' : 'Consultez les alertes et recommandations pour améliorer le suivi.'}</div>
          </article>
          <article className="kpi-main-panel kpi-recent-panel">
            <div className="kpi-panel-title"><div><strong>Dernières campagnes</strong><span>Activité récente du CRM</span></div><Clock/></div>
            {recent.slice(0,4).map((item) => <div className="kpi-recent-row" key={item.id}><div><strong>{item.titre}</strong><span>{formatDate(item.date_modification)}</span></div><span className={`status-pill ${STATUS_COLORS[item.status]}`}>{STATUS_LABELS[item.status]}</span></div>)}
            {recent.length === 0 && <p className="kpi-no-data">Aucune campagne enregistrée.</p>}
          </article>
        </div>
        <div className="kpi-module-grid">
          <article className="kpi-module-card kpi-glass-card"><div className="kpi-module-heading"><span className="kpi-module-icon email"><Mail/></span><span>Email</span><small>{moduleStats.email.loaded ? 'Connecté' : 'Indisponible'}</small></div><strong className="kpi-module-value">{moduleStats.email.sent.toLocaleString('fr-FR')}</strong><span className="kpi-module-caption">Emails envoyés au total</span><div className="kpi-daily-comparison"><div><span>Aujourd’hui</span><strong>{moduleStats.email.todaySent.toLocaleString('fr-FR')}</strong></div><div><span>Hier</span><strong>{moduleStats.email.yesterdaySent.toLocaleString('fr-FR')}</strong></div><span className={moduleStats.email.todaySent > moduleStats.email.yesterdaySent ? 'kpi-trend positive' : moduleStats.email.todaySent < moduleStats.email.yesterdaySent ? 'kpi-trend negative' : 'kpi-trend neutral'}><TrendingUp size={14}/>{moduleStats.email.yesterdaySent > 0 ? ((moduleStats.email.todaySent >= moduleStats.email.yesterdaySent ? '+' : '') + Math.round(((moduleStats.email.todaySent - moduleStats.email.yesterdaySent) / moduleStats.email.yesterdaySent) * 100) + '%') : (moduleStats.email.todaySent > 0 ? 'Nouveau' : '—')}</span></div><div className="kpi-module-pairs"><div><b>{moduleStats.email.campaigns}</b><span>Campagnes</span></div><div><b>{moduleStats.email.opened}</b><span>Ouvertures</span></div><div><b>{moduleStats.email.clicked}</b><span>Clics</span></div><div><b>{moduleStats.email.failed}</b><span>Échecs</span></div></div></article>
          <article className="kpi-module-card kpi-glass-card"><div className="kpi-module-heading"><span className="kpi-module-icon whatsapp"><MessageCircle/></span><span>WhatsApp</span><small>{moduleStats.whatsapp.loaded ? 'Connecté' : 'Indisponible'}</small></div><strong className="kpi-module-value">{moduleStats.whatsapp.recipients.toLocaleString('fr-FR')}</strong><span className="kpi-module-caption">Destinataires préparés</span><div className="kpi-daily-comparison"><div><span>Aujourd’hui</span><strong>{moduleStats.whatsapp.todaySent.toLocaleString('fr-FR')}</strong></div><div><span>Hier</span><strong>{moduleStats.whatsapp.yesterdaySent.toLocaleString('fr-FR')}</strong></div><span className={moduleStats.whatsapp.todaySent > moduleStats.whatsapp.yesterdaySent ? 'kpi-trend positive' : moduleStats.whatsapp.todaySent < moduleStats.whatsapp.yesterdaySent ? 'kpi-trend negative' : 'kpi-trend neutral'}><TrendingUp size={14}/>{moduleStats.whatsapp.yesterdaySent > 0 ? ((moduleStats.whatsapp.todaySent >= moduleStats.whatsapp.yesterdaySent ? '+' : '') + Math.round(((moduleStats.whatsapp.todaySent - moduleStats.whatsapp.yesterdaySent) / moduleStats.whatsapp.yesterdaySent) * 100) + '%') : (moduleStats.whatsapp.todaySent > 0 ? 'Nouveau' : '—')}</span></div><div className="kpi-module-pairs"><div><b>{moduleStats.whatsapp.campaigns}</b><span>Campagnes</span></div><div><b>{moduleStats.whatsapp.running}</b><span>En cours</span></div><div><b>{moduleStats.whatsapp.sent}</b><span>Envoyés au total</span></div><div><b>{moduleStats.whatsapp.failed}</b><span>Échecs</span></div></div></article>
          <article className="kpi-module-card"><div className="kpi-module-heading"><span className="kpi-module-icon tasks"><ListTodo/></span><span>Tasks</span><small>{moduleStats.tasks.loaded ? 'Connecté' : 'Indisponible'}</small></div><strong className="kpi-module-value">{moduleStats.tasks.open.toLocaleString('fr-FR')}</strong><span className="kpi-module-caption">Tâches à suivre</span><div className="kpi-module-pairs"><div><b>{moduleStats.tasks.total}</b><span>Total</span></div><div><b>{moduleStats.tasks.done}</b><span>Terminées</span></div><div><b>{moduleStats.tasks.late}</b><span>En retard</span></div><div><b>{teamUsers.length}</b><span>Membres</span></div></div></article>
          <article className="kpi-module-card"><div className="kpi-module-heading"><span className="kpi-module-icon sms"><ContactRound/></span><span>SMS</span><small>Simulation</small></div><strong className="kpi-module-value">—</strong><span className="kpi-module-caption">Aucun envoi réel comptabilisé</span><div className="kpi-module-pairs"><div><b>{stats.listes}</b><span>Listes cibles</span></div><div><b>{stats.contacts}</b><span>Contacts CRM</span></div><div><b>Non</b><span>Tracking</span></div><div><b>—</b><span>Livraisons</span></div></div></article>
          <article className="kpi-module-card"><div className="kpi-module-heading"><span className="kpi-module-icon database"><UsersRound/></span><span>Contacts & listes</span><small>CRM</small></div><strong className="kpi-module-value">{stats.contacts.toLocaleString('fr-FR')}</strong><span className="kpi-module-caption">Contacts enregistrés</span><div className="kpi-module-pairs"><div><b>{stats.listes}</b><span>Listes</span></div><div><b>{teamUsers.length}</b><span>Membres</span></div><div><b>{commentaires.length}</b><span>Commentaires</span></div><div><b>{campagneMembres.length}</b><span>Affectations</span></div></div></article>
        </div>
        <p className="kpi-footnote">* Le suivi détaillé des statuts destinataires WhatsApp n’est pas encore exposé par le tableau de bord global. SMS : envoi actuellement simulé, donc aucun volume réel n’est comptabilisé.</p>
        <section className="workspace-panel dashboard-team-overview">
          <div className="workspace-panel-header"><h2>Performance des membres et des équipes</h2><span>{teamUsers.length} membre(s)</span></div>
          {teamUsers.length === 0 ? <p className="kpi-no-data">Aucun membre disponible.</p> : <div className="dashboard-team-table-wrap"><table className="dashboard-team-table"><thead><tr><th>Membre</th><th>Équipe / rôle</th><th>Campagnes créées</th><th>Campagnes affectées</th><th>En cours</th><th>Terminées</th></tr></thead><tbody>{teamUsers.map((member) => { const owned = campagnes.filter((campaign) => campaign.user_id === member.id); const assigned = campagneMembres.filter((link) => link.user_id === member.id).length; return <tr key={member.id}><td><strong>{`${member.prenom} ${member.nom}`.trim() || member.email}</strong><span>{member.email}</span></td><td>{teamRoles.find((role) => role.id === member.role_id)?.nom ?? '—'}</td><td>{owned.length}</td><td>{assigned}</td><td>{owned.filter((campaign) => campaign.status === 'en_cours').length}</td><td>{owned.filter((campaign) => campaign.status === 'terminee').length}</td></tr> })}</tbody></table></div>}
        </section>
      </section> : <section className="dashboard-member-overview">
        <div className="dashboard-member-card"><span>Mes campagnes</span><strong>{dashboardCampaigns.length}</strong><small>Créées ou affectées à votre compte</small></div>
        <div className="dashboard-member-card"><span>En cours</span><strong>{dashboardCampaigns.filter((campaign) => campaign.status === 'en_cours').length}</strong><small>Campagnes actives</small></div>
        <div className="dashboard-member-card"><span>Terminées</span><strong>{dashboardCampaigns.filter((campaign) => campaign.status === 'terminee').length}</strong><small>Campagnes finalisées</small></div>
        <div className="dashboard-member-card"><span>À préparer</span><strong>{dashboardCampaigns.filter((campaign) => campaign.status === 'brouillon').length}</strong><small>Brouillons à lancer</small></div>
      </section>}

      <div className="workspace-panels">
        <div className="workspace-panel">
          <div className="workspace-panel-header">
            <h2>Campagnes récentes</h2>
            <span>{dashboardCampaigns.length} au total</span>
          </div>
          {recent.length === 0 ? (
            <div className="workspace-empty">
              <BarChart3 aria-hidden="true" />
              <p>Aucune campagne pour le moment.</p>
              <span>{isAdmin ? 'Les campagnes créées par les équipes apparaîtront ici.' : 'Créez votre première campagne depuis l’onglet « Campagnes ».'}</span>
            </div>
          ) : (
            <ul className="campagne-list">
              {recent.map((c) => {
                const typeName = typeNameById.get(c.type_campagne_id)
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="campagne-list-item"
                      onClick={() => setSelectedCampagneId(c.id)}
                    >
                      <div>
                        <strong>{c.titre}</strong>
                        <span>
                          {typeName ?? '—'}
                          {c.note ? ` · ${c.note}` : ''}
                        </span>
                      </div>
                      <span className={`status-pill ${STATUS_COLORS[c.status]}`}>
                        {STATUS_LABELS[c.status]}
                      </span>
                      <span className="campagne-list-date">
                        <CalendarDays aria-hidden="true" /> {formatDate(c.date_modification)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="workspace-panel">
          <div className="workspace-panel-header">
            <h2>{selectedCampagne ? 'Commentaires' : 'Détail de la campagne'}</h2>
            {selectedCampagne && (
              <button
                type="button"
                className="workspace-icon-button"
                onClick={() => setSelectedCampagneId(null)}
                aria-label="Fermer le détail"
              >
                <X aria-hidden="true" />
              </button>
            )}
          </div>
          {!selectedCampagne ? (
            <div className="workspace-empty">
              <MessageCircle aria-hidden="true" />
              <p>Sélectionnez une campagne.</p>
              <span>Vous pourrez consulter ses détails et y ajouter des commentaires.</span>
            </div>
          ) : (
            <div className="campagne-detail">
              <div className="campagne-detail-head">
                <h3>{selectedCampagne.titre}</h3>
                <span className={`status-pill ${STATUS_COLORS[selectedCampagne.status]}`}>
                  {STATUS_LABELS[selectedCampagne.status]}
                </span>
              </div>
              <dl className="campagne-detail-grid">
                <div>
                  <dt>Type</dt>
                  <dd>{typesCampagnes.find((item) => item.id === selectedCampagne.type_campagne_id)?.nom ?? '—'}</dd>
                </div>
                <div><dt>Créée le</dt><dd>{formatDate(selectedCampagne.date_creation)}</dd></div>
                <div><dt>Cible</dt><dd>{selectedCampagne.cible || '—'}</dd></div>
                <div><dt>Note</dt><dd>{selectedCampagne.note || '—'}</dd></div>
              </dl>

              <div className="campagne-comments">
                <h4>Commentaires ({selectedComments.length})</h4>
                {selectedComments.length === 0 ? (
                  <p className="campagne-comments-empty">Aucun commentaire pour le moment.</p>
                ) : (
                  <ul>
                    {selectedComments.map((cm) => {
                      const author = teamUsers.find((item) => item.id === cm.user_id)
                      return (
                        <li key={cm.id}>
                          <div className="comment-meta">
                            <strong>{author ? `${author.prenom} ${author.nom}` : 'Utilisateur'}</strong>
                            <span>{formatDate(cm.date_creation)}</span>
                          </div>
                          <p>{cm.contenu}</p>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <form
                  className="comment-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!draft.trim()) {
                      toast.error('Commentaire vide', 'Écrivez un message avant de publier.')
                      return
                    }
                    onAddComment(selectedCampagne.id, draft.trim())
                    toast.success('Commentaire ajouté', 'Votre message a été publié.')
                    setDraft('')
                  }}
                >
                  <textarea
                    placeholder="Ajouter un commentaire…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={2}
                  />
                  <button type="submit" disabled={!draft.trim()}>
                    <MessageCircle aria-hidden="true" /> Publier
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
        <section className="kpi-system-grid">
          <article className="kpi-system-card kpi-system-speed">
            <div className="kpi-panel-title"><div><strong>Vitesse du site</strong><span>Évolution du temps de réponse — mesures réelles chaque minute</span></div><Activity /></div>
            <div className="kpi-speed-chart-summary">
              <div><strong>{systemHealth.website?.responseMs != null ? systemHealth.website.responseMs.toLocaleString('fr-FR') : '—'}<small> ms</small></strong><span>Dernière mesure</span></div>
              <div><strong>{speedHistory.length ? Math.round(speedHistory.reduce((sum, point) => sum + point.ms, 0) / speedHistory.length).toLocaleString('fr-FR') : '—'}<small> ms</small></strong><span>Moyenne de la session</span></div>
              <div className="kpi-system-status"><span className={systemHealth.website?.status === 'online' ? 'good' : systemHealth.website?.status === 'slow' ? 'warn' : 'bad'} />{systemHealth.website?.status === 'online' ? 'Site opérationnel' : systemHealth.website?.status === 'slow' ? 'Réponse lente' : systemHealth.website?.status === 'offline' ? 'Site inaccessible' : 'En attente'}</div>
            </div>
            <div className="kpi-speed-chart-wrap">
              {speedHistory.length > 1 ? (() => {
                const values = speedHistory.map((point) => point.ms)
                const min = Math.max(0, Math.min(...values) - 100)
                const max = Math.max(min + 200, ...values) + 100
                const coords = speedHistory.map((point, index) => ({
                  x: 36 + (index / Math.max(1, speedHistory.length - 1)) * 688,
                  y: 184 - ((point.ms - min) / (max - min)) * 150,
                  ...point,
                }))
                return <svg viewBox="0 0 760 230" role="img" aria-label="Graphique de l'évolution du temps de réponse du site">
                  {[34, 84, 134, 184].map((y) => <line key={y} x1="36" x2="724" y1={y} y2={y} className="kpi-speed-gridline" />)}
                  <text x="4" y="38" className="kpi-speed-axis">{Math.round(max)} ms</text>
                  <text x="4" y="188" className="kpi-speed-axis">{Math.round(min)} ms</text>
                  <polygon points={`36,184 ${coords.map((point) => `${point.x},${point.y}`).join(' ')} 724,184`} className="kpi-speed-area" />
                  <polyline points={coords.map((point) => `${point.x},${point.y}`).join(' ')} className="kpi-speed-line" />
                  {coords.map((point, index) => <g key={index}><circle cx={point.x} cy={point.y} r="4" className="kpi-speed-dot"><title>{point.time} — {point.ms} ms</title></circle></g>)}
                  <text x="36" y="218" className="kpi-speed-axis">{coords[0].time}</text>
                  <text x="724" y="218" textAnchor="end" className="kpi-speed-axis">{coords[coords.length - 1].time}</text>
                </svg>
              })() : <div className="kpi-speed-empty"><Activity size={22}/><span>{speedHistory.length === 1 ? 'Première mesure enregistrée. Le graphique se dessinera avec les prochaines mesures.' : 'En attente des premières mesures réelles…'}</span></div>}
            </div>
            <p className="kpi-system-note">{healthLoading ? 'Vérification en cours…' : 'Historique conservé pendant cette session du Dashboard (30 dernières mesures). La mesure correspond au temps de réponse serveur, pas aux Core Web Vitals.'}</p>
          </article>
          <article className="kpi-system-card">
            <div className="kpi-panel-title"><div><strong>Base de données</strong><span>Volume réel des enregistrements Supabase</span></div><UsersRound /></div>
            <div className="kpi-system-main"><strong>{systemHealth.database ? systemHealth.database.totalRows.toLocaleString('fr-FR') : '—'}</strong><span>lignes comptabilisées</span></div>
            <div className="kpi-system-table-list">
              {(systemHealth.database?.tables ?? []).map((table) => <div key={table.name}><span>{table.name}</span><strong>{table.available ? Number(table.rows ?? 0).toLocaleString('fr-FR') : 'Indisponible'}</strong></div>)}
            </div>
            <p className="kpi-system-note">Quota disque restant : non exposé par l’API standard Supabase. Les chiffres ci-dessus représentent les lignes, pas l’espace disque.</p>
          </article>
        </section>
    </section>
  )
}