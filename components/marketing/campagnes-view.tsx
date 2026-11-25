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
} from '@/lib/storage'
import { useToast } from '@/components/ui/toast'
import { formatDate, STATUS_COLORS, STATUS_LABELS } from './shared'

interface CampagnesViewProps {
  user: User
  campagnes: Campagne[]
  listes: ListeContact[]
  typesCampagnes: TypeCampagne[]
  campagneListes: CampagneListe[]
  campagneMembres: { id: number; campagne_id: number; user_id: number }[]
  teamUsers: User[]
  contactListCounts: Record<number, number>
  onCreate: (
    data: Omit<Campagne, 'id' | 'user_id' | 'date_creation' | 'date_modification'>,
  ) => Promise<Campagne | null>
  onUpdate: (id: number, patch: Partial<Pick<Campagne, 'type_campagne_id' | 'titre' | 'cible' | 'note' | 'status'>>) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onSetListes: (campagneId: number, listeIds: number[]) => Promise<void>
  onSetMembres: (campagneId: number, userIds: number[]) => Promise<void>
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
  user,
  campagnes,
  listes,
  typesCampagnes,
  campagneListes,
  campagneMembres,
  teamUsers,
  contactListCounts,
  onCreate,
  onUpdate,
  onDelete,
  onSetListes,
  onSetMembres,
  onOpenListes,
}: CampagnesViewProps) {
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [formListeIds, setFormListeIds] = useState<number[]>([])
  const [formMemberIds, setFormMemberIds] = useState<number[]>([])
  const [memberPickerOpen, setMemberPickerOpen] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [filter, setFilter] = useState<CampagneStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // Les filtres et la recherche sont exécutés localement sur les données déjà chargées.
  const campaignListLinks = Array.isArray(campagneListes) ? campagneListes : []
  const localListes = Array.isArray(listes) ? listes : []
  const localTypes = Array.isArray(typesCampagnes) ? typesCampagnes : []

  const types = localTypes.filter((type) => type.actif)
  const allListes = localListes
  const normalizedSearch = search.trim().toLocaleLowerCase('fr')
  const assignedCampaignIds = new Set(campagneMembres.filter((assignment) => assignment.user_id === user.id).map((assignment) => assignment.campagne_id))
  const campaignsVisibleToUser = user.role_id === 1
    ? (Array.isArray(campagnes) ? campagnes : [])
    : (Array.isArray(campagnes) ? campagnes : []).filter((campaign) => assignedCampaignIds.has(campaign.id))
  const filtered = campaignsVisibleToUser.filter((campaign) => {
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
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize)
  const editing = editingId ? campagnes.find((c) => c.id === editingId) ?? null : null

  function openCreate() {
    setEditingId(null)
    setForm({ ...emptyForm, type_campagne_id: types[0]?.id ?? 1 })
    setFormListeIds([])
    setFormMemberIds([])
    setMemberPickerOpen(false)
    setMemberSearch('')
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
    setFormMemberIds(campagneMembres.filter((link) => link.campagne_id === c.id).map((link) => link.user_id))
    setMemberPickerOpen(false)
    setMemberSearch('')
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
      if (user.role_id === 1) await onSetMembres(editingId, formMemberIds)
      toast.success('Campagne mise à jour', `« ${payload.titre} » enregistrée.`)
    } else {
      const created = await onCreate(payload)
      if (!created) return
      await onSetListes(created.id, formListeIds)
      if (user.role_id === 1) await onSetMembres(created.id, formMemberIds)
      toast.success('Campagne créée', `« ${payload.titre} » ajoutée.`)
    }
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setFormListeIds([])
    setFormMemberIds([])
    setMemberPickerOpen(false)
    setMemberSearch('')
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
              <input id="campagnes-local-search" type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Rechercher dans les campagnes…" />
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
                  <th>Membres associés</th>
                  <th>Modifiée le</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((c) => {
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
                      <td>{campagneMembres.filter((link) => link.campagne_id === c.id).map((link) => teamUsers.find((member) => member.id === link.user_id)).filter(Boolean).map((member) => `${member!.prenom} ${member!.nom}`.trim()).join(', ') || '—'}</td>
                      <td>{formatDate(c.date_modification)}</td>
                      <td className="campagne-table-actions">
                        {user.role_id === 1 ? (
                          <>
                            <button type="button" onClick={() => openEdit(c)} aria-label="Modifier">
                              <Pencil aria-hidden="true" />
                            </button>
                            <button type="button" className="danger" onClick={() => void handleDelete(c)} aria-label="Supprimer">
                              <Trash2 aria-hidden="true" />
                            </button>
                          </>
                        ) : <span className="campagne-table-desc">Campagne assignée</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="pagination-toolbar"><label>Afficher <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select> par page</label><span>{filtered.length} campagnes · page {page}/{Math.max(1,Math.ceil(filtered.length/pageSize))}</span><div><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Précédent</button><button disabled={page>=Math.ceil(filtered.length/pageSize)} onClick={()=>setPage(p=>p+1)}>Suivant</button></div></div>
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

                {user.role_id === 1 && <div className="form-grid-full campaign-member-field">
                  <span className="form-label">Membres associés à cette campagne</span>
                  <p className="form-hint">Sélectionnez un ou plusieurs membres. Ils retrouveront cette campagne dans leur espace.</p>
                  {teamUsers.length === 0 ? <p className="form-hint">Aucun membre disponible.</p> : (
                    <div className="campaign-member-picker">
                      <button
                        type="button"
                        className={`campaign-member-trigger${memberPickerOpen ? ' is-open' : ''}`}
                        onClick={() => setMemberPickerOpen((open) => !open)}
                        aria-expanded={memberPickerOpen}
                        aria-haspopup="listbox"
                      >
                        <span className="campaign-member-trigger-copy">
                          <strong>{formMemberIds.length ? `${formMemberIds.length} membre(s) sélectionné(s)` : 'Choisir les membres'}</strong>
                          <small>{formMemberIds.length ? teamUsers.filter((member) => formMemberIds.includes(member.id)).map((member) => `${member.prenom} ${member.nom}`).join(', ') : 'Tous les membres disponibles'}</small>
                        </span>
                        <ChevronDown size={17} aria-hidden="true" />
                      </button>
                      {memberPickerOpen && (
                        <div className="campaign-member-menu">
                          <label className="campaign-member-search">
                            <Search size={15} aria-hidden="true" />
                            <input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Rechercher un membre…" />
                          </label>
                          <div className="campaign-member-options" role="listbox" aria-multiselectable="true" aria-label="Membres associés">
                            {teamUsers.filter((member) => `${member.prenom} ${member.nom} ${member.email}`.toLocaleLowerCase('fr').includes(memberSearch.trim().toLocaleLowerCase('fr'))).map((member) => {
                              const checked = formMemberIds.includes(member.id)
                              return (
                                <label key={member.id} className={`campaign-member-option${checked ? ' is-selected' : ''}`}>
                                  <input type="checkbox" checked={checked} onChange={() => setFormMemberIds((current) => checked ? current.filter((id) => id !== member.id) : [...current, member.id])} />
                                  <span className="campaign-member-avatar">{member.prenom?.charAt(0)}{member.nom?.charAt(0)}</span>
                                  <span className="campaign-member-option-copy"><strong>{member.prenom} {member.nom}</strong><small>{member.email}</small></span>
                                  {checked && <Check size={16} aria-hidden="true" />}
                                </label>
                              )
                            })}
                            {teamUsers.filter((member) => `${member.prenom} ${member.nom} ${member.email}`.toLocaleLowerCase('fr').includes(memberSearch.trim().toLocaleLowerCase('fr'))).length === 0 && <p className="form-hint campaign-member-empty">Aucun membre correspondant.</p>}
                          </div>
                          <div className="campaign-member-menu-footer">
                            <span>{formMemberIds.length} sélectionné(s)</span>
                            <button type="button" onClick={() => setFormMemberIds([])}>Tout désélectionner</button>
                            <button type="button" onClick={() => setMemberPickerOpen(false)}>Terminé</button>
                          </div>
                        </div>
                      )}
                      {formMemberIds.length > 0 && <div className="campaign-member-chips">
                        {teamUsers.filter((member) => formMemberIds.includes(member.id)).map((member) => (
                          <button key={member.id} type="button" onClick={() => setFormMemberIds((current) => current.filter((id) => id !== member.id))} aria-label={`Retirer ${member.prenom} ${member.nom}`}>
                            {member.prenom} {member.nom}<X size={12} />
                          </button>
                        ))}
                      </div>}
                    </div>
                  )}
                </div>}
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