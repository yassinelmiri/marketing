'use client'

import { useMemo, useState } from 'react'
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
  commentaires: Commentaire[]
  typesCampagnes: TypeCampagne[]
  teamUsers: User[]
  onAddComment: (campagneId: number, contenu: string) => void
}

export function DashboardView({
  user,
  stats,
  campagnes,
  commentaires,
  typesCampagnes,
  teamUsers,
  onAddComment,
}: DashboardViewProps) {
  const [selectedCampagneId, setSelectedCampagneId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')

  const selectedCampagne = campagnes.find((c) => c.id === selectedCampagneId) ?? null
  const selectedComments = commentaires.filter((c) => c.campagne_id === selectedCampagneId)

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
                const type = typesCampagnes.find((item) => item.id === c.type_campagne_id)
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
                          {type?.nom ?? '—'}
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