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
  AlertTriangle,
  TrendingUp,
  MailCheck,
  Target,
  Sparkles,
  Mail,
  Smartphone,
  ListTodo,
  AlertCircle,
  Send,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
import {
  type Campagne,
  type Commentaire,
  type User,
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
  onAddComment,
}: DashboardViewProps) {
  const toast = useToast()
  const [selectedCampagneId, setSelectedCampagneId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [moduleStats, setModuleStats] = useState<{
    email: { campaigns: number; sent: number; failed: number; opened: number; clicked: number; running: number; loaded: boolean }
    whatsapp: { campaigns: number; recipients: number; sent: number; failed: number; running: number; loaded: boolean }
    tasks: { total: number; open: number; done: number; late: number; loaded: boolean }
  }>({
    email: { campaigns: 0, sent: 0, failed: 0, opened: 0, clicked: 0, running: 0, loaded: false },
    whatsapp: { campaigns: 0, recipients: 0, sent: 0, failed: 0, running: 0, loaded: false },
    tasks: { total: 0, open: 0, done: 0, late: 0, loaded: false },
  })
  const [moduleError, setModuleError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
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
          loaded: emailResult.status === 'fulfilled',
        },
        whatsapp: {
          campaigns: whatsappCampaigns.length,
          recipients: whatsappCampaigns.reduce((sum: number, item: { total_recipients?: number }) => sum + Number(item.total_recipients || 0), 0),
          sent: 0,
          failed: 0,
          running: whatsappCampaigns.filter((item: { status?: string }) => item.status === 'in_progress').length,
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
  }, [])

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

  const selectedComments = useMemo(
    () => commentaires.filter((comment) => comment.campagne_id === selectedCampagneId),
    [commentaires, selectedCampagneId],
  )

  const recent = useMemo(
    () =>
      [...campagnes]
        .sort((a, b) => (a.date_modification < b.date_modification ? 1 : -1))
        .slice(0, 5),
    [campagnes],
  )

  return (
    <section className="workspace-section dashboard-page">
      <div className="dashboard-welcome">
        <div>
          <span className="settings-eyebrow">VOTRE ESPACE DE PILOTAGE</span>
          <h2>Bonjour {user.prenom} 👋</h2>
          <p>Voici un aperçu de votre activité et de vos dernières opérations.</p>
        </div>
        <div className="dashboard-date-chip"><CalendarDays aria-hidden="true" /> Espace de travail</div>
      </div>
      <div className="workspace-metrics">
        <article className="metric-card">
          <span className="metric-icon"><BarChart3 aria-hidden="true" /></span>
          <div><span>Campagnes totales</span><strong>{stats.total}</strong></div>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-progress"><Clock aria-hidden="true" /></span>
          <div><span>En cours</span><strong>{stats.enCours}</strong></div>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-done"><CheckCircle2 aria-hidden="true" /></span>
          <div><span>Terminées</span><strong>{stats.terminees}</strong></div>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-draft"><Pencil aria-hidden="true" /></span>
          <div><span>Brouillons</span><strong>{stats.brouillons}</strong></div>
        </article>
      </div>

      <div className="dashboard-secondary-metrics">
        <article><span className="dashboard-secondary-icon"><ListChecks aria-hidden="true" /></span><div><strong>{stats.listes}</strong><span>Listes</span></div></article>
        <article><span className="dashboard-secondary-icon"><ContactRound aria-hidden="true" /></span><div><strong>{stats.contacts}</strong><span>Contacts</span></div></article>
        <article><span className="dashboard-secondary-icon"><UsersRound aria-hidden="true" /></span><div><strong>{stats.membres}</strong><span>Membres visibles</span></div></article>
      </div>

      <div className="workspace-panel associated-campaigns-panel">
        <div className="workspace-panel-header">
          <div><h2>Campagnes associées</h2><p>Les campagnes qui vous sont attribuées par l’administrateur.</p></div>
          <span>{associatedCampaigns.length} campagne(s)</span>
        </div>
        {associatedCampaigns.length === 0 ? (
          <div className="workspace-empty associated-campaigns-empty">
            <BarChart3 aria-hidden="true" />
            <p>Aucune campagne associée pour le moment.</p>
            <span>Lorsqu’une campagne vous sera attribuée, elle apparaîtra ici, même sans liste de contacts.</span>
          </div>
        ) : (
          <div className="associated-campaigns-list">
            {associatedCampaigns.map((campaign) => {
              const typeName = typeNameById.get(campaign.type_campagne_id)
              return <article className="associated-campaign-item" key={campaign.id}>
                <div><strong>{campaign.titre}</strong><span>{typeName ?? 'Campagne'} · {STATUS_LABELS[campaign.status]}</span>{campaign.note && <p>{campaign.note}</p>}</div>
                <small>{formatDate(campaign.date_modification)}</small>
              </article>
            })}
          </div>
        )}
      </div>

      <div className="dashboard-overview-grid">
        <section className="dashboard-analytics-panel">
          <header className="dashboard-analytics-heading"><div><span className="settings-eyebrow">ANALYSE DU PROJET</span><h2>Vue d’ensemble & performance</h2><p>Indicateurs calculés à partir des données présentes dans votre espace.</p></div><span className="dashboard-live-tag"><Activity size={14}/> Actualisé</span></header>
          <div className="dashboard-health-row">
            <div className="dashboard-health-score"><div className="dashboard-health-ring" style={{ '--health-score': diagnostic.health } as CSSProperties}><div><strong>{diagnostic.health}</strong><span>/100</span></div></div><span>Indice de suivi</span></div>
            <div className="dashboard-health-summary"><strong>{diagnostic.health >= 70 ? 'Projet bien suivi' : diagnostic.health >= 40 ? 'Projet à optimiser' : 'Projet à structurer'}</strong><p>Indice indicatif basé sur l’avancement, l’activité récente, la collaboration et la base contacts. Ce n’est pas une mesure de délivrabilité ou de conversion.</p><div className="dashboard-health-progress"><span style={{width: `${diagnostic.health}%`}} /></div></div>
          </div>
          <div className="dashboard-status-breakdown">
            {[
              { label: 'En cours', value: diagnostic.active, color: 'progress' },
              { label: 'Terminées', value: diagnostic.completed, color: 'done' },
              { label: 'Brouillons', value: diagnostic.drafts, color: 'draft' },
              { label: 'Archivées', value: diagnostic.archived, color: 'archived' },
            ].map((item) => <div key={item.label} className="dashboard-status-stat"><span className={`dashboard-status-dot ${item.color}`}/><span>{item.label}</span><strong>{item.value}</strong></div>)}
          </div>
          <div className="dashboard-analytics-metrics"><div><TrendingUp/><span>Taux de finalisation</span><strong>{diagnostic.completionRate}%</strong></div><div><Clock/><span>Activité sur 30 jours</span><strong>{diagnostic.recentCampaigns} campagne(s)</strong></div><div><MessageCircle/><span>Engagement équipe</span><strong>{commentaires.length} commentaire(s)</strong></div><div><Target/><span>Contacts / liste</span><strong>{stats.listes ? Math.round(stats.contacts / stats.listes).toLocaleString('fr-FR') : '—'}</strong></div></div>
        </section>
        <section className="dashboard-diagnostic-panel">
          <header className="dashboard-analytics-heading"><div><span className="settings-eyebrow">DIAGNOSTIC</span><h2>Recommandations</h2><p>Points d’attention pour améliorer votre organisation.</p></div><Sparkles size={19}/></header>
          <div className="dashboard-findings">{diagnostic.findings.map((finding, i) => <article key={i} className={`dashboard-finding ${finding.tone}`}><span className="dashboard-finding-icon">{finding.tone === 'warn' ? <AlertTriangle/> : finding.tone === 'good' ? <CheckCircle2/> : <Activity/>}</span><div><strong>{finding.title}</strong><p>{finding.detail}</p></div></article>)}</div>
        </section>
      </div>

      <section className="kpi-command-center">
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
              { label: 'Listes sans contact', value: listes.filter((list) => !(stats.contacts && list.id in {}).length).length, warning: false },
            ].slice(0,3).map((item) => <div className="kpi-alert-row" key={item.label}><span className={item.warning ? 'warning' : 'ok'}/><span>{item.label}</span><strong>{item.value}</strong></div>)}
            <div className="kpi-alert-foot">{diagnostic.health >= 70 ? 'Votre organisation est globalement bien suivie.' : 'Consultez les alertes et recommandations pour améliorer le suivi.'}</div>
          </article>
          <article className="kpi-main-panel kpi-recent-panel">
            <div className="kpi-panel-title"><div><strong>Dernières campagnes</strong><span>Activité récente du CRM</span></div><Clock/></div>
            {recent.slice(0,4).map((item) => <div className="kpi-recent-row" key={item.id}><div><strong>{item.titre}</strong><span>{formatDate(item.date_modification)}</span></div><span className={`status-pill ${STATUS_COLORS[item.status]}`}>{STATUS_LABELS[item.status]}</span></div>)}
            {recent.length === 0 && <p className="kpi-no-data">Aucune campagne enregistrée.</p>}
          </article>
        </div>
        <div className="kpi-module-grid">
          <article className="kpi-module-card"><div className="kpi-module-heading"><span className="kpi-module-icon email"><Mail/></span><span>Email</span><small>{moduleStats.email.loaded ? 'Connecté' : 'Indisponible'}</small></div><strong className="kpi-module-value">{moduleStats.email.sent.toLocaleString('fr-FR')}</strong><span className="kpi-module-caption">Emails envoyés</span><div className="kpi-module-pairs"><div><b>{moduleStats.email.campaigns}</b><span>Campagnes</span></div><div><b>{moduleStats.email.opened}</b><span>Ouvertures</span></div><div><b>{moduleStats.email.clicked}</b><span>Clics</span></div><div><b>{moduleStats.email.failed}</b><span>Échecs</span></div></div></article>
          <article className="kpi-module-card"><div className="kpi-module-heading"><span className="kpi-module-icon whatsapp"><MessageCircle/></span><span>WhatsApp</span><small>{moduleStats.whatsapp.loaded ? 'Connecté' : 'Indisponible'}</small></div><strong className="kpi-module-value">{moduleStats.whatsapp.recipients.toLocaleString('fr-FR')}</strong><span className="kpi-module-caption">Destinataires préparés</span><div className="kpi-module-pairs"><div><b>{moduleStats.whatsapp.campaigns}</b><span>Campagnes</span></div><div><b>{moduleStats.whatsapp.running}</b><span>En cours</span></div><div><b>—</b><span>Envoyés*</span></div><div><b>—</b><span>Échecs*</span></div></div></article>
          <article className="kpi-module-card"><div className="kpi-module-heading"><span className="kpi-module-icon tasks"><ListTodo/></span><span>Tasks</span><small>{moduleStats.tasks.loaded ? 'Connecté' : 'Indisponible'}</small></div><strong className="kpi-module-value">{moduleStats.tasks.open.toLocaleString('fr-FR')}</strong><span className="kpi-module-caption">Tâches à suivre</span><div className="kpi-module-pairs"><div><b>{moduleStats.tasks.total}</b><span>Total</span></div><div><b>{moduleStats.tasks.done}</b><span>Terminées</span></div><div><b>{moduleStats.tasks.late}</b><span>En retard</span></div><div><b>{teamUsers.length}</b><span>Membres</span></div></div></article>
          <article className="kpi-module-card"><div className="kpi-module-heading"><span className="kpi-module-icon database"><UsersRound/></span><span>Contacts & listes</span><small>CRM</small></div><strong className="kpi-module-value">{stats.contacts.toLocaleString('fr-FR')}</strong><span className="kpi-module-caption">Contacts enregistrés</span><div className="kpi-module-pairs"><div><b>{stats.listes}</b><span>Listes</span></div><div><b>{teamUsers.length}</b><span>Membres</span></div><div><b>{commentaires.length}</b><span>Commentaires</span></div><div><b>{campagneMembres.length}</b><span>Affectations</span></div></div></article>
        </div>
        <p className="kpi-footnote">* Le suivi détaillé des statuts destinataires WhatsApp n’est pas encore exposé par le tableau de bord global. SMS : envoi actuellement simulé, donc aucun volume réel n’est comptabilisé.</p>
      </section>

      <div className="workspace-panels">
        <div className="workspace-panel">
          <div className="workspace-panel-header">
            <h2>Campagnes récentes</h2>
            <span>{campagnes.length} au total</span>
          </div>
          {recent.length === 0 ? (
            <div className="workspace-empty">
              <BarChart3 aria-hidden="true" />
              <p>Aucune campagne pour le moment.</p>
              <span>Créez votre première campagne depuis l’onglet « Campagnes ».</span>
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
    </section>
  )
}