'use client'

import { useMemo, useState, type CSSProperties } from 'react'
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