'use client'

import { useState } from 'react'
import { BarChart3, ChevronDown, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import {
  type Campagne,
  type CampagneStatus,
  type User,
  type ListeContact,
  type TypeCampagne,
  type CampagneListe,
  type Contact,
} from '@/lib/storage'
import { useToast } from '@/components/ui/toast'
import { formatDate, STATUS_COLORS, STATUS_LABELS } from './shared'

interface CampagnesViewProps {
  user: User
  campagnes: Campagne[]
  listes: ListeContact[]
  contacts: Contact[]
  typesCampagnes: TypeCampagne[]
  campagneListes: CampagneListe[]
  contactListCounts: Record<number, number>
  onCreate: (
    data: Omit<Campagne, 'id' | 'user_id' | 'date_creation' | 'date_modification'>,
  ) => Promise<Campagne | null>
  onUpdate: (id: number, patch: Partial<Pick<Campagne, 'type_campagne_id' | 'titre' | 'cible' | 'note' | 'status'>>) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onSetListes: (campagneId: number, listeIds: number[]) => Promise<void>
  onOpenListes: () => void
}

const emptyForm = {
  titre: '',
  type_campagne_id: 1,
  cible: '',
  note: '',
  status: 'brouillon' as CampagneStatus,
}

export function CampagnesView({
  campagnes,
  listes,
  contacts,
  typesCampagnes,
  campagneListes,
  contactListCounts,
  onCreate,
  onUpdate,
  onDelete,
  onSetListes,
  onOpenListes,
}: CampagnesViewProps) {
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [formListeIds, setFormListeIds] = useState<number[]>([])
  const [filter, setFilter] = useState<CampagneStatus | 'all'>('all')
  const [search, setSearch] = useState('')

  // Les filtres et la recherche sont exécutés localement sur les données déjà chargées.
  const campaignListLinks = Array.isArray(campagneListes) ? campagneListes : []
  const localListes = Array.isArray(listes) ? listes : []
  const localTypes = Array.isArray(typesCampagnes) ? typesCampagnes : []

  const types = localTypes.filter((type) => type.actif)
  const allListes = localListes
  const normalizedSearch = search.trim().toLocaleLowerCase('fr')
  const filtered = (Array.isArray(campagnes) ? campagnes : []).filter((campaign) => {
    const matchesStatus = filter === 'all' || campaign.status === filter
    if (!matchesStatus) return false
    if (!normalizedSearch) return true
    const campaignType = localTypes.find((type) => type.id === campaign.type_campagne_id)?.nom ?? ''
    const linkedListNames = campaignListLinks
      .filter((link) => link.campagne_id === campaign.id)
      .map((link) => localListes.find((list) => list.id === link.liste_id)?.nom ?? '')
      .join(' ')
    return [campaign.titre, campaign.note, campaign.cible, campaignType, linkedListNames, STATUS_LABELS[campaign.status]]
      .join(' ').toLocaleLowerCase('fr').includes(normalizedSearch)
  })
  const editing = editingId ? campagnes.find((c) => c.id === editingId) ?? null : null

  function openCreate() {
    setEditingId(null)
    setForm({ ...emptyForm, type_campagne_id: types[0]?.id ?? 1 })
    setFormListeIds([])
    setShowForm(true)
  }

  function openEdit(c: Campagne) {
    setEditingId(c.id)
    setForm({
      titre: c.titre,
      type_campagne_id: c.type_campagne_id,
      cible: c.cible,
      note: c.note,
      status: c.status,
    })
    setFormListeIds(campaignListLinks.filter((link) => link.campagne_id === c.id).map((link) => link.liste_id))
    setShowForm(true)
  }

  function toggleFormListe(listeId: number) {
    setFormListeIds((ids) =>
      ids.includes(listeId) ? ids.filter((id) => id !== listeId) : [...ids, listeId],
    )
  }

  async function submit() {
    if (!form.titre.trim()) {
      toast.error('Titre requis', 'Donnez un titre à votre campagne.')
      return
    }
    const payload = {
      titre: form.titre.trim(),
      type_campagne_id: form.type_campagne_id,
      cible: form.cible,
      note: form.note,
      status: form.status,
    }

    if (editingId) {
      await onUpdate(editingId, payload)
      await onSetListes(editingId, formListeIds)
      toast.success('Campagne mise à jour', `« ${payload.titre} » enregistrée.`)
    } else {
      const created = await onCreate(payload)
      if (!created) return
      await onSetListes(created.id, formListeIds)
      toast.success('Campagne créée', `« ${payload.titre} » ajoutée.`)
    }
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setFormListeIds([])
  }

  async function handleDelete(c: Campagne) {
    if (!confirm(`Supprimer la campagne « ${c.titre} » ?`)) return
    await onDelete(c.id)
    toast.success('Campagne supprimée', `« ${c.titre} » retirée.`)
  }

  return (
    <section className="workspace-section data-section">
      <div className="data-page">
        <header className="data-page-heading">
          <div>
            <span className="data-eyebrow">MARKETING &amp; PERFORMANCE</span>
            <h1>Campagnes</h1>
            <p>Planifiez vos actions, ciblez vos audiences et suivez l’avancement de chaque campagne.</p>
          </div>
          <button type="button" className="workspace-primary" onClick={openCreate}>
            <Plus aria-hidden="true" /> Nouvelle campagne
          </button>
        </header>
        <div className="data-overview-grid data-campaign-overview">
          <article className="data-overview-card"><span>Total campagnes</span><strong>{campagnes.length}</strong><small>Toutes les campagnes</small></article>
          <article className="data-overview-card"><span>En cours</span><strong>{campagnes.filter((item) => item.status === 'en_cours').length}</strong><small>Actions actives</small></article>
          <article className="data-overview-card"><span>Brouillons</span><strong>{campagnes.filter((item) => item.status === 'brouillon').length}</strong><small>À préparer</small></article>
          <article className="data-overview-card"><span>Terminées</span><strong>{campagnes.filter((item) => item.status === 'terminee').length}</strong><small>Actions finalisées</small></article>
        </div>
      <div className="workspace-panel data-content-panel">
        <div className="data-panel-heading">
          <div><h2>Suivi des campagnes</h2><p>Retrouvez les campagnes, leurs statuts et les listes ciblées.</p></div>
          <span className="data-count-pill">{filtered.length} résultat(s)</span>
        </div>
        <div className="workspace-toolbar data-campaign-toolbar">
            <label className="campagne-search" htmlFor="campagnes-local-search">
              <Search size={17} aria-hidden="true" />
              <input id="campagnes-local-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher dans les campagnes…" />
              {search && <button type="button" onClick={() => setSearch('')} aria-label="Effacer la recherche"><X size={15}/></button>}
            </label>
            <div className="workspace-select">
              <select value={filter} onChange={(e) => setFilter(e.target.value as CampagneStatus | 'all')}>
                <option value="all">Tous les statuts</option>
                <option value="brouillon">Brouillon</option>
                <option value="en_cours">En cours</option>
                <option value="terminee">Terminée</option>
                <option value="archivee">Archivée</option>
              </select>
              <ChevronDown aria-hidden="true" />
            </div>
            <button type="button" className="workspace-secondary" onClick={onOpenListes}>
              Gérer les listes
            </button>
          </div>

        {filtered.length === 0 ? (
          <div className="workspace-empty">
            <BarChart3 aria-hidden="true" />
            <p>{search || filter !== 'all' ? 'Aucun résultat pour ces critères.' : 'Aucune campagne trouvée.'}</p>
            <span>{search || filter !== 'all' ? 'Modifiez la recherche ou le filtre pour afficher des résultats.' : 'Cliquez sur « Nouvelle campagne » pour commencer.'}</span>
          </div>
        ) : (
          <div className="campagne-table-wrap">
            <table className="campagne-table">
              <thead>
                <tr>
                  <th>Titre</th>
                  <th>Type</th>
                  <th>Statut</th>
                  <th>Listes</th>
                  <th>Modifiée le</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const type = localTypes.find((item) => item.id === c.type_campagne_id)
                  const campaignListsForRow = campaignListLinks.filter((link) => link.campagne_id === c.id).map((link) => localListes.find((item) => item.id === link.liste_id)).filter((item): item is ListeContact => Boolean(item))
                  return (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.titre}</strong>
                        <span className="campagne-table-desc">{c.note || '—'}</span>
                      </td>
                      <td>{type?.nom ?? '—'}</td>
                      <td>
                        <span className={`status-pill ${STATUS_COLORS[c.status]}`}>
                          {STATUS_LABELS[c.status]}
                        </span>
                      </td>
                      <td>
                        {campaignListsForRow.length === 0 ? '—' : campaignListsForRow.map((l) => l.nom).join(', ')}
                      </td>
                      <td>{formatDate(c.date_modification)}</td>
                      <td className="campagne-table-actions">
                        <button type="button" onClick={() => openEdit(c)} aria-label="Modifier">
                          <Pencil aria-hidden="true" />
                        </button>
                        <button type="button" className="danger" onClick={() => void handleDelete(c)} aria-label="Supprimer">
                          <Trash2 aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>

      {showForm && (
        <div className="workspace-modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="workspace-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>{editing ? 'Modifier la campagne' : 'Nouvelle campagne'}</h3>
              <button type="button" className="workspace-icon-button" onClick={() => setShowForm(false)} aria-label="Fermer">
                <X aria-hidden="true" />
              </button>
            </header>
            <div className="workspace-modal-body">
              <div className="form-grid">
                <label className="form-grid-full">
                  <span>Titre de la campagne</span>
                  <input value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} placeholder="Lancement produit" />
                </label>
                <label>
                  <span>Type</span>
                  <select value={form.type_campagne_id} onChange={(e) => setForm({ ...form, type_campagne_id: Number(e.target.value) })}>
                    {types.map((t) => (
                      <option key={t.id} value={t.id}>{t.nom}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Statut</span>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CampagneStatus })}>
                    <option value="brouillon">Brouillon</option>
                    <option value="en_cours">En cours</option>
                    <option value="terminee">Terminée</option>
                    <option value="archivee">Archivée</option>
                  </select>
                </label>
                <label className="form-grid-full">
                  <span>Cible</span>
                  <input value={form.cible} onChange={(e) => setForm({ ...form, cible: e.target.value })} placeholder="Prospects, clients, segment…" />
                </label>

                <div className="form-grid-full">
                  <span className="form-label">Listes ciblées par la campagne</span>
                  {allListes.length === 0 ? (
                    <p className="form-hint">
                      Aucune liste disponible.{' '}
                      <button type="button" className="link-button" onClick={onOpenListes}>
                        Créer une liste
                      </button>
                    </p>
                  ) : (
                    <div className="checkbox-grid">
                      {allListes.map((l) => {
                        const checked = formListeIds.includes(l.id)
                        return (
                          <label key={l.id} className={`checkbox-card${checked ? ' is-on' : ''}`}>
                            <input type="checkbox" checked={checked} onChange={() => toggleFormListe(l.id)} />
                            <div>
                              <strong>{l.nom}</strong>
                              <span>{l.cible || 'Sans cible'} · {(contactListCounts[l.id] ?? 0)} contacts</span>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>

                <label className="form-grid-full">
                  <span>Note</span>
                  <textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Détails internes…" />
                </label>
              </div>
            </div>
            <footer>
              <button type="button" className="workspace-secondary" onClick={() => setShowForm(false)}>Annuler</button>
              <button type="button" className="workspace-primary" onClick={() => void submit()}>
                {editing ? 'Enregistrer' : 'Créer la campagne'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  )
}