'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  FileSpreadsheet,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Users,
  X,
  Search,
} from 'lucide-react'
import {
  CONTACT_IMPORT_COLUMNS,
  type Contact,
  type ListeContact,
  type User,
  type Campagne,
  type CampagneListe,
  type ListeContactContact,
} from '@/lib/storage'
import {
  createListe,
  updateListe,
  deleteListe as deleteListeInDb,
  createContact,
  updateContact,
  setContactListes,
  setCampagneListes,
  setListeCampagnes,
  importContactsToListe,
} from '@/lib/supabase/marketing-data'
import { useToast } from '@/components/ui/toast'
import { formatDate } from './shared'
import { IMPORT_FIELD_OPTIONS, buildImportMapping } from '@/lib/contacts/import-mapping'
import { parseContactImportFile } from '@/lib/contacts/file-parser'

interface ListesViewProps {
  user: User
  listes: ListeContact[]
  campagnes: Campagne[]
  campagneListes: CampagneListe[]
  campagneMembres: { id: number; campagne_id: number; user_id: number }[]
  teamUsers: User[]
  onRefresh: () => void
  contactCount: number
  contactListCounts: Record<number, number>
}

const emptyContactForm = {
  nom: '',
  prenom: '',
  reseau_social: '',
  telephone: '',
  mobile: '',
  address: '',
  code_postal: '',
  ville: '',
  email: '',
  profile: '',
  commentaire: '',
}

const emptyListeForm = {
  nom: '',
  description: '',
  cible: '',
  note: '',
  ajoute_par_nom: '',
  date_creation: '',
}

export function ListesView({ user, listes, campagnes, campagneListes, campagneMembres, contactCount, contactListCounts, teamUsers, onRefresh }: ListesViewProps) {
  const toast = useToast()

  const [selectedListeId, setSelectedListeId] = useState<number | null>(listes[0]?.id ?? null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactLinks, setContactLinks] = useState<ListeContactContact[]>([])
  const [contactPage, setContactPage] = useState(1)
  const [contactPageSize, setContactPageSize] = useState(25)
  const [listePage, setListePage] = useState(1)
  const [listePageSize, setListePageSize] = useState(25)
  const [contactTotal, setContactTotal] = useState(0)
  const [selectedListCount, setSelectedListCount] = useState(0)
  const [contactSearch, setContactSearch] = useState('')
  const [contactDateFrom, setContactDateFrom] = useState('')
  const [contactDateTo, setContactDateTo] = useState('')
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([])
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [debouncedContactSearch, setDebouncedContactSearch] = useState('')
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactsReloadKey, setContactsReloadKey] = useState(0)

  const [showListeForm, setShowListeForm] = useState(false)
  const [savingListe, setSavingListe] = useState(false)
  const [editingListe, setEditingListe] = useState<ListeContact | null>(null)
  const [listeForm, setListeForm] = useState(emptyListeForm)
  const [listeCampagneIds, setListeCampagneIds] = useState<number[]>([])
  const [listeSearch, setListeSearch] = useState('')
  const [listeDateFilter, setListeDateFilter] = useState('all')
  const [listeSort, setListeSort] = useState<'date-desc' | 'date-asc' | 'name-asc' | 'name-desc'>('date-desc')

  const [showContactForm, setShowContactForm] = useState(false)
  const [savingContact, setSavingContact] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [contactForm, setContactForm] = useState(emptyContactForm)
  const [contactListeIds, setContactListeIds] = useState<number[]>([])

  const [showImport, setShowImport] = useState(false)
  const [importRows, setImportRows] = useState<Record<string, string>[]>([])
  const [importHeaders, setImportHeaders] = useState<string[]>([])
  const [importMapping, setImportMapping] = useState<Record<string, string>>({})
  const [importFileName, setImportFileName] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Les listes arrivent après le chargement Supabase; sélectionner la première automatiquement.
  useEffect(() => {
    if (!listes.some((liste) => liste.id === selectedListeId)) {
      setSelectedListeId(listes[0]?.id ?? null)
    }
  }, [listes, selectedListeId])

  const allCampagnes = campagnes
  const visibleListes = useMemo(() => {
    const query = listeSearch.trim().toLocaleLowerCase('fr')
    const now = new Date()
    const assignedCampaignIds = new Set(campagneMembres
      .filter((assignment) => assignment.user_id === user.id)
      .map((assignment) => assignment.campagne_id))
    const assignedListeIds = new Set(campagneListes
      .filter((link) => assignedCampaignIds.has(link.campagne_id))
      .map((link) => link.liste_id))
    const availableLists = Number(user.role_id) === 1
      ? listes
      : listes.filter((liste) => liste.created_by === user.id || assignedListeIds.has(liste.id))
    const filtered = availableLists.filter((liste) => {
      const matchesText = !query || [liste.nom, liste.description, liste.cible]
        .some((value) => (value ?? '').toLocaleLowerCase('fr').includes(query))
      if (!matchesText) return false
      if (listeDateFilter === 'all') return true
      const createdAt = new Date(liste.date_creation)
      if (Number.isNaN(createdAt.getTime())) return false
      const start = new Date(now)
      if (listeDateFilter === 'today') start.setHours(0, 0, 0, 0)
      if (listeDateFilter === '7d') start.setDate(start.getDate() - 7)
      if (listeDateFilter === '30d') start.setDate(start.getDate() - 30)
      return createdAt >= start
    })
    return filtered.sort((a, b) => {
      if (listeSort === 'name-asc') return a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' })
      if (listeSort === 'name-desc') return b.nom.localeCompare(a.nom, 'fr', { sensitivity: 'base' })
      const delta = new Date(a.date_creation).getTime() - new Date(b.date_creation).getTime()
      return listeSort === 'date-asc' ? delta : -delta
    })
  }, [listes, campagneListes, campagneMembres, user.id, user.role_id, listeSearch, listeDateFilter, listeSort])
  const paginatedListes = visibleListes.slice((listePage - 1) * listePageSize, listePage * listePageSize)
  const selectedListe = listes.find((l) => l.id === selectedListeId) ?? null
  const listeContacts = contacts
  const teamUsersById = useMemo(() => new Map(teamUsers.map((member) => [member.id, member])), [teamUsers])
  const contactListNamesByContactId = useMemo(() => {
    const listsById = new Map(listes.map((liste) => [liste.id, liste.nom]))
    const namesByContactId = new Map<number, string[]>()
    for (const link of contactLinks) {
      const listName = listsById.get(link.liste_id)
      if (!listName) continue
      const names = namesByContactId.get(link.contact_id) ?? []
      names.push(listName)
      namesByContactId.set(link.contact_id, names)
    }
    return namesByContactId
  }, [contactLinks, listes])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedContactSearch(contactSearch.trim()), 300)
    return () => clearTimeout(timer)
  }, [contactSearch])

  useEffect(() => {
    let active = true
    setSelectedContactIds([])

    async function loadContactPage() {
      const loadingStartedAt = Date.now()
      if (!selectedListeId) {
        setContacts([])
        setContactLinks([])
        setContactTotal(0)
        setSelectedListCount(0)
        setContactsLoading(false)
        return
      }

      setContactsLoading(true)
      try {
        const params = new URLSearchParams({ listId: String(selectedListeId), page: String(contactPage), pageSize: String(contactPageSize) })
        if (debouncedContactSearch) params.set('q', debouncedContactSearch)
        if (contactDateFrom) params.set('dateFrom', contactDateFrom)
        if (contactDateTo) params.set('dateTo', contactDateTo)

        // Let the request finish; the active flag below prevents stale responses
        // from updating state after filters change or the component unmounts.
        const response = await fetch('/api/contacts?' + params.toString(), { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Chargement des contacts impossible.')
        if (!active) return

        setContacts(data.contacts ?? [])
        setContactLinks(data.links ?? [])
        setContactTotal(Number(data.total ?? 0))
        setSelectedListCount(Number(data.listCount ?? 0))
      } catch (error) {
        // Ignore failures from an effect that has already been replaced or unmounted.
        // DOMException is not guaranteed to extend Error in every browser/runtime.
        const isAbortError = typeof error === 'object'
          && error !== null
          && 'name' in error
          && error.name === 'AbortError'
        if (!active || isAbortError) return
        toast.error('Contacts indisponibles', error instanceof Error ? error.message : 'Erreur de chargement.')
      } finally {
        // Keep the indicator visible long enough to be noticed, even for fast API responses.
        const remainingLoadingTime = Math.max(0, 450 - (Date.now() - loadingStartedAt))
        if (active) {
          if (remainingLoadingTime > 0) {
            await new Promise((resolve) => setTimeout(resolve, remainingLoadingTime))
          }
          setContactsLoading(false)
        }
      }
    }

    void loadContactPage()
    return () => {
      active = false
    }
  }, [selectedListeId, contactPage, contactPageSize, debouncedContactSearch, contactDateFrom, contactDateTo, contactsReloadKey, toast.error])

  // ── Handlers liste ───────────────────────────────────
  function openCreateListe() {
    setEditingListe(null)
    setListeCampagneIds([])
    const me = user
    setListeForm({
      nom: '',
      description: '',
      cible: '',
      note: '',
      ajoute_par_nom: `${me.prenom} ${me.nom}`.trim(),
      date_creation: '',
    })
    setShowListeForm(true)
  }
  function openEditListe(l: ListeContact) {
    setEditingListe(l)
    setListeCampagneIds(campagneListes.filter((link) => link.liste_id === l.id).map((link) => link.campagne_id))
    setListeForm({
      nom: l.nom,
      description: l.description,
      cible: l.cible ?? '',
      note: l.note ?? '',
      ajoute_par_nom: l.ajoute_par_nom ?? '',
      date_creation: (l.date_creation ?? new Date().toISOString()).slice(0, 16),
    })
    setShowListeForm(true)
  }
  async function submitListe() {
    if (savingListe) return
    if (!listeForm.nom.trim()) {
      toast.error('Nom requis', 'Donnez un nom à la liste.')
      return
    }

    setSavingListe(true)
    try {
      if (editingListe) {
        await updateListe(editingListe.id, {
          nom: listeForm.nom.trim(),
          description: listeForm.description,
          cible: listeForm.cible,
          note: listeForm.note,
          ajoute_par_nom: listeForm.ajoute_par_nom,
        })
        await setListeCampagnes(editingListe.id, listeCampagneIds)
      } else {
        const created = await createListe({
          nom: listeForm.nom.trim(),
          description: listeForm.description,
          cible: listeForm.cible,
          note: listeForm.note,
          ajoute_par_nom: `${user.prenom} ${user.nom}`.trim(),
          created_by: user.id,
        })
        if (listeCampagneIds.length > 0) {
          try {
            await setListeCampagnes(created.id, listeCampagneIds)
          } catch (error) {
            await deleteListeInDb(created.id)
            throw error
          }
        }
        setSelectedListeId(created.id)
      }

      toast.success(editingListe ? 'Liste mise à jour' : 'Liste créée')
      setShowListeForm(false)
      setContactsReloadKey((key) => key + 1)
      await onRefresh()
    } catch (error) {
      toast.error('Enregistrement impossible', error instanceof Error ? error.message : 'Erreur Supabase.')
    } finally {
      setSavingListe(false)
    }
  }
  async function deleteListe(l: ListeContact) {
    if (!confirm(`Supprimer la liste « ${l.nom} » et ses contacts ?`)) return
    try {
      await deleteListeInDb(l.id)
      if (selectedListeId === l.id) setSelectedListeId(null)
      toast.success('Liste supprimée', `« ${l.nom} » retirée.`)
      setContactsReloadKey((key) => key + 1)
      await onRefresh()
    } catch (error) {
      toast.error('Suppression impossible', error instanceof Error ? error.message : 'Erreur Supabase.')
    }
  }

  // ── Handlers contact ─────────────────────────────────
  function openCreateContact() {
    if (!selectedListe) return
    setEditingContact(null)
    setContactForm(emptyContactForm)
    setContactListeIds([selectedListe.id])
    setShowContactForm(true)
  }
  function openEditContact(c: Contact) {
    setEditingContact(c)
    setContactForm({
      nom: c.nom,
      prenom: c.prenom,
      reseau_social: c.reseau_social,
      telephone: c.telephone,
      mobile: c.mobile,
      address: c.address,
      code_postal: c.code_postal,
      ville: c.ville,
      email: c.email,
      profile: c.profile,
      commentaire: c.commentaire,
    })
    setContactListeIds(contactLinks.filter((link) => link.contact_id === c.id).map((link) => link.liste_id))
    setShowContactForm(true)
  }
  function toggleContactListe(listeId: number) {
    setContactListeIds((ids) =>
      ids.includes(listeId) ? ids.filter((id) => id !== listeId) : [...ids, listeId],
    )
  }
  async function submitContact() {
    if (savingContact) return
    if (!contactForm.nom.trim() && !contactForm.email.trim()) {
      toast.error('Champs requis', 'Nom ou e-mail obligatoire.')
      return
    }
    if (contactListeIds.length === 0) {
      toast.error('Liste requise', 'Sélectionnez au moins une liste pour ce contact.')
      return
    }
    setSavingContact(true)
    try {
      if (editingContact) {
        await updateContact(editingContact.id, contactForm)
        await setContactListes(editingContact.id, contactListeIds)
        toast.success('Contact mis à jour', 'Enregistré.')
      } else {
        const created = await createContact({ ...contactForm, created_by: user.id })
        await setContactListes(created.id, contactListeIds)
        toast.success('Contact ajouté', 'Ajouté aux listes sélectionnées.')
      }
      setShowContactForm(false)
      setEditingContact(null)
      setContactsReloadKey((key) => key + 1)
      await onRefresh()
    } catch (error) {
      toast.error('Enregistrement impossible', error instanceof Error ? error.message : 'Erreur Supabase.')
    } finally {
      setSavingContact(false)
    }
  }
  async function deleteContacts(ids: number[]) {
    const uniqueIds = [...new Set(ids)].filter((id) => Number.isSafeInteger(id) && id > 0)
    if (!uniqueIds.length || bulkDeleting) return
    const message = uniqueIds.length === 1
      ? 'Supprimer définitivement ce contact ?'
      : `Supprimer définitivement les ${uniqueIds.length} contacts sélectionnés ?`
    if (!confirm(message)) return
    setBulkDeleting(true)
    try {
      const response = await fetch('/api/contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: uniqueIds }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Suppression impossible.')
      setSelectedContactIds([])
      toast.success('Suppression terminée', `${Number(data.deleted ?? uniqueIds.length)} contact(s) supprimé(s).`)
      setContactsReloadKey((key) => key + 1)
      await onRefresh()
    } catch (error) {
      toast.error('Suppression impossible', error instanceof Error ? error.message : 'Erreur serveur.')
    } finally {
      setBulkDeleting(false)
    }
  }
  async function deleteContact(c: Contact) {
    await deleteContacts([c.id])
  }
  const pageContactIds = listeContacts.map((contact) => contact.id)
  const allPageContactsSelected = pageContactIds.length > 0 && pageContactIds.every((id) => selectedContactIds.includes(id))
  function togglePageContacts() {
    setSelectedContactIds((current) => allPageContactsSelected
      ? current.filter((id) => !pageContactIds.includes(id))
      : [...new Set([...current, ...pageContactIds])])
  }
  function toggleContactSelection(id: number) {
    setSelectedContactIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }

  // ── Import CSV ───────────────────────────────────────
  async function handleFile(file: File) {
    setImportFileName(file.name)
    try {
      const { headers, rows } = await parseContactImportFile(file)
      setImportHeaders(headers)
      setImportMapping(buildImportMapping(headers))
      setImportRows(rows)
      toast.success('Fichier analysé', `${rows.length} ligne(s) détectée(s).`)
    } catch (error) {
      console.error('[contacts] import file parsing failed:', error)
      toast.error('Import impossible', error instanceof Error ? error.message : 'Impossible de lire ce fichier.')
    }
  }
  async function confirmImport() {
    if (!selectedListe) return
    if (importRows.length === 0) {
      toast.error('Aucune donnée', 'Aucune ligne à importer.')
      return
    }
    const mappedRows = importRows.map((row) => {
      const mapped: Record<string, string> = {}
      Object.entries(importMapping).forEach(([header, field]) => {
        if (field && row[header] != null) mapped[field] = row[header]
      })
      return mapped
    })
    try {
      const res = await importContactsToListe(selectedListe.id, user.id, mappedRows)
      if (res.created > 0) toast.success('Import terminé', `${res.created} contact(s) créé(s).`)
      if (res.errors.length > 0) toast.error('Import partiel', `${res.errors.length} erreur(s).`)
      setShowImport(false)
      setImportRows([])
      setImportHeaders([])
      setImportMapping({})
      setImportFileName('')
      setContactsReloadKey((key) => key + 1)
      await onRefresh()
    } catch (error) {
      toast.error('Import impossible', error instanceof Error ? error.message : 'Erreur Supabase.')
    }
  }
  function downloadTemplate() {
    const headers = CONTACT_IMPORT_COLUMNS.join(',')
    const example =
      'Dupont,Jeanne,B2B,+212600000000,+212611111111,12 rue X,75001,Paris,jeanne@exemple.com,https://linkedin.com/in/jeanne,Client VIP'
    const csv = `${headers}\n${example}\n`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modele_contacts.csv'
    a.click()
    URL.revokeObjectURL(url)
    toast.info('Modèle téléchargé', 'Un fichier CSV d’exemple a été généré.')
  }

  return (
    <section className="workspace-section data-section">
      <div className="data-page">
        <header className="data-page-heading">
          <div>
            <span className="data-eyebrow">BASE DE DONNÉES</span>
            <h1>Listes &amp; contacts</h1>
            <p>Organisez vos audiences, centralisez vos contacts et préparez vos campagnes.</p>
          </div>
          <button type="button" className="workspace-primary" onClick={openCreateListe}>
            <Plus aria-hidden="true" /> Nouvelle liste
          </button>
        </header>
        <div className="data-overview-grid">
          <article className="data-overview-card"><span>Listes enregistrées</span><strong>{listes.length}</strong><small>Audiences disponibles</small></article>
          <article className="data-overview-card"><span>Contacts au total</span><strong>{contactCount}</strong><small>Contacts centralisés</small></article>
          <article className="data-overview-card"><span>Contacts dans la liste</span><strong>{selectedListCount}</strong><small>{selectedListe?.nom || 'Aucune liste sélectionnée'}</small></article>
          <article className="data-overview-card"><span>Campagnes associées</span><strong>{selectedListe ? campagneListes.filter((link) => link.liste_id === selectedListe.id).length : 0}</strong><small>Campagnes liées à la sélection</small></article>
        </div>
      <div className="bases-layout data-split-layout">
        {/* Colonne 1 : listes */}
        <div className="workspace-panel data-list-panel">
          <div className="workspace-panel-header data-subpanel-heading">
            <div><h2><FolderPlus aria-hidden="true" /> Vos listes</h2><p>Choisissez une audience pour consulter et gérer ses contacts.</p></div>
            <span className="data-count-pill">{visibleListes.length} / {listes.length}</span>
          </div>
          <div className="workspace-toolbar data-list-toolbar">
            <label className="data-search-field">
              <Search aria-hidden="true" />
              <input aria-label="Rechercher une liste" value={listeSearch} onChange={(e) => { setListeSearch(e.target.value); setListePage(1) }} placeholder="Rechercher une liste…" />
            </label>
            <select aria-label="Filtrer les listes par date" value={listeDateFilter} onChange={(e) => { setListeDateFilter(e.target.value); setListePage(1) }} className="workspace-select">
              <option value="all">Toutes les dates</option>
              <option value="today">Aujourd’hui</option>
              <option value="7d">7 derniers jours</option>
              <option value="30d">30 derniers jours</option>
            </select>
            <select aria-label="Trier les listes" value={listeSort} onChange={(e) => { setListeSort(e.target.value as typeof listeSort); setListePage(1) }} className="workspace-select">
              <option value="date-desc">Plus récentes</option>
              <option value="date-asc">Plus anciennes</option>
              <option value="name-asc">Nom A → Z</option>
              <option value="name-desc">Nom Z → A</option>
            </select>
          </div>
          {listes.length === 0 ? (
            <div className="workspace-empty">
              <FolderPlus aria-hidden="true" />
              <p>Aucune liste.</p>
              <span>Créez votre première liste pour organiser vos contacts.</span>
            </div>
          ) : (
            <>
            <ul className="bases-list">
              {paginatedListes.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    className={`liste-item${selectedListeId === l.id ? ' is-active' : ''}`}
                    onClick={() => { setSelectedListeId(l.id); setContactPage(1); setContactSearch('') }}
                  >
                    <div>
                      <strong>{l.nom}</strong>
                      <span>
                        {contactListCounts[l.id] ?? 0} contact(s) · {l.cible || 'Sans cible'}
                      </span>
                    </div>
                  </button>
                  <div className="liste-item-actions">
                    <button type="button" onClick={() => openEditListe(l)} aria-label="Modifier">
                      <Pencil aria-hidden="true" />
                    </button>
                    <button type="button" className="danger" onClick={() => void deleteListe(l)} aria-label="Supprimer">
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
              {visibleListes.length === 0 && (
                <li className="workspace-empty" style={{ listStyle: 'none', padding: 16 }}>
                  <p>Aucune liste ne correspond à votre recherche.</p>
                </li>
              )}
            </ul>
            {visibleListes.length > 0 && (
              <div className="pagination-toolbar">
                <label>
                  Afficher{' '}
                  <select value={listePageSize} onChange={(e) => { setListePageSize(Number(e.target.value)); setListePage(1) }}>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>{' '}
                  par page
                </label>
                <span>{visibleListes.length} listes · page {listePage}/{Math.max(1, Math.ceil(visibleListes.length / listePageSize))}</span>
                <div>
                  <button disabled={listePage <= 1} onClick={() => setListePage((p) => p - 1)}>Précédent</button>
                  <button disabled={listePage >= Math.ceil(visibleListes.length / listePageSize)} onClick={() => setListePage((p) => p + 1)}>Suivant</button>
                </div>
              </div>
            )}
            </>
          )}
        </div>

        {/* Colonne 2 : contacts de la liste */}
        <div className="workspace-panel data-contacts-panel">
          <div className="workspace-panel-header data-subpanel-heading">
            <div>
              <h2><Users aria-hidden="true" /> Contacts de la sélection</h2>
              <p>{selectedListe ? `Liste active : ${selectedListe.nom}` : 'Sélectionnez une liste pour afficher ses contacts.'}</p>
            </div>
            <div className="workspace-toolbar">
              {selectedListe && (
                <>
                  <button type="button" className="workspace-secondary" onClick={() => setShowImport(true)}>
                    <Upload aria-hidden="true" /> Importer
                  </button>
                  <button type="button" className="workspace-primary" onClick={openCreateContact}>
                    <Plus aria-hidden="true" /> Ajouter
                  </button>
                </>
              )}
            </div>
          </div>
          {selectedListe && <div className="contacts-filter-toolbar">
            <label className="data-search-field"><Search aria-hidden="true" /><input aria-label="Rechercher un contact" value={contactSearch} onChange={(e) => { setContactSearch(e.target.value); setContactPage(1) }} placeholder="Rechercher par nom, e-mail, téléphone ou ville…" /></label>
            <label><span>Ajouté à partir du</span><input type="date" aria-label="Date d'ajout début" value={contactDateFrom} max={contactDateTo || undefined} onChange={(e) => { setContactDateFrom(e.target.value); setContactPage(1) }}/></label>
            <label><span>Jusqu'au</span><input type="date" aria-label="Date d'ajout fin" value={contactDateTo} min={contactDateFrom || undefined} onChange={(e) => { setContactDateTo(e.target.value); setContactPage(1) }}/></label>
            {(contactDateFrom || contactDateTo) && <button type="button" className="workspace-secondary" onClick={() => { setContactDateFrom(''); setContactDateTo(''); setContactPage(1) }}>Réinitialiser</button>}
          </div>}
          {selectedListe && selectedContactIds.length > 0 && <div className="contacts-bulk-toolbar">
            <span><strong>{selectedContactIds.length}</strong> contact(s) sélectionné(s) sur cette page</span>
            <button type="button" className="workspace-danger" disabled={bulkDeleting} onClick={() => void deleteContacts(selectedContactIds)}><Trash2 aria-hidden="true" />{bulkDeleting ? 'Suppression…' : `Supprimer (${selectedContactIds.length})`}</button>
          </div>}
          {!selectedListe ? (
            <div className="workspace-empty">
              <Users aria-hidden="true" />
              <p>Sélectionnez une liste.</p>
            </div>
          ) : listeContacts.length === 0 && !contactsLoading ? (
            <div className="workspace-empty">
              <Users aria-hidden="true" />
              <p>Aucun contact dans cette liste.</p>
              <span>Ajoutez un contact ou importez un CSV/XLSX.</span>
            </div>
          ) : (
            <div className={`campagne-table-wrap contacts-table-loading${contactsLoading ? ' is-loading' : ''}`} aria-busy={contactsLoading}>
              {contactsLoading && <div className="contacts-table-progress"><span className="contacts-table-spinner" />Mise à jour des contacts…</div>}
              <table className="campagne-table">
                <thead>
                  <tr>
                    <th className="contacts-select-column"><input type="checkbox" aria-label="Sélectionner tous les contacts de cette page" checked={allPageContactsSelected} onChange={togglePageContacts}/></th>
                    <th>Nom</th>
                    <th>Contact</th>
                    <th>Ville</th>
                    <th>Listes</th>
                    <th>Ajouté</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {listeContacts.length === 0 && contactsLoading ? Array.from({ length: 5 }, (_, index) => (
                    <tr className="contacts-skeleton-row" key={`loading-${index}`} aria-hidden="true">
                      <td /><td><span /><span /></td><td><span /><span /></td><td><span /></td><td><span /></td><td><span /></td><td />
                    </tr>
                  )) : listeContacts.map((c) => {
                    const author = teamUsersById.get(c.created_by)
                    const contactListNames = contactListNamesByContactId.get(c.id) ?? []
                    return (
                      <tr key={c.id}>
                        <td className="contacts-select-column"><input type="checkbox" aria-label={`Sélectionner ${c.prenom} ${c.nom}`} checked={selectedContactIds.includes(c.id)} onChange={() => toggleContactSelection(c.id)}/></td>
                        <td>
                          <strong>{c.prenom} {c.nom}</strong>
                          {c.profile && (
                            <span className="campagne-table-desc">
                              <a href={c.profile} target="_blank" rel="noreferrer">Profil</a>
                            </span>
                          )}
                        </td>
                        <td>
                          {c.email || '—'}
                          <span className="campagne-table-desc">{c.mobile || c.telephone}</span>
                        </td>
                        <td>
                          {c.ville || '—'}
                          <span className="campagne-table-desc">{c.code_postal}</span>
                        </td>
                        <td>{contactListNames.join(', ') || '—'}</td>
                        <td>
                          {formatDate(c.date_creation)}
                          <span className="campagne-table-desc">
                            par {author ? `${author.prenom} ${author.nom}` : '—'}
                          </span>
                        </td>
                        <td className="campagne-table-actions">
                          <button type="button" onClick={() => openEditContact(c)} aria-label="Modifier">
                            <Pencil aria-hidden="true" />
                          </button>
                          <button type="button" className="danger" onClick={() => void deleteContact(c)} aria-label="Supprimer" disabled={bulkDeleting}>
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
          {selectedListe && contactTotal > 0 && <div className="workspace-toolbar" style={{ justifyContent: 'space-between', marginTop: 12 }}><span>{contactTotal} contact(s) · page {contactPage} / {Math.max(1, Math.ceil(contactTotal / contactPageSize))}</span><label>Afficher <select value={contactPageSize} onChange={e=>{setContactPageSize(Number(e.target.value));setContactPage(1)}}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label><div className="workspace-toolbar"><button type="button" className="workspace-secondary" disabled={contactPage <= 1 || contactsLoading} onClick={() => setContactPage(page => page - 1)}>Précédent</button><button type="button" className="workspace-secondary" disabled={contactPage >= Math.ceil(contactTotal / contactPageSize) || contactsLoading} onClick={() => setContactPage(page => page + 1)}>Suivant</button></div></div>}
        </div>
      </div>
      </div>

      {/* Modal liste */}
      {showListeForm && (
        <div className="workspace-modal-backdrop" onClick={() => setShowListeForm(false)}>
          <div className="workspace-modal data-entry-modal data-list-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>{editingListe ? 'Modifier la liste' : 'Nouvelle liste'}</h3>
              <button type="button" className="workspace-icon-button" onClick={() => setShowListeForm(false)} aria-label="Fermer">
                <X aria-hidden="true" />
              </button>
            </header>
            <div className="workspace-modal-body">
              <div className="form-grid">
                <label className="form-grid-full">
                  <span>Nom de la liste</span>
                  <input value={listeForm.nom} onChange={(e) => setListeForm({ ...listeForm, nom: e.target.value })} placeholder="Prospects Q1" />
                </label>
                <div className="form-grid-full liste-campaign-field">
                  <span className="form-label">Campagnes associées (facultatif)</span>
                  <p className="form-hint">Sélectionnez une ou plusieurs campagnes pour cette liste.</p>
                  {allCampagnes.length === 0 ? <p className="form-hint">Aucune campagne disponible.</p> : (
                    <div className="liste-campaign-options">
                      {allCampagnes.map((campagne) => {
                        const checked = listeCampagneIds.includes(campagne.id)
                        return (
                          <label key={campagne.id} className={`liste-campaign-option${checked ? ' is-selected' : ''}`}>
                            <input type="checkbox" checked={checked} onChange={() => setListeCampagneIds((current) => checked ? current.filter((id) => id !== campagne.id) : [...current, campagne.id])} />
                            <span>{campagne.titre}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
                <label className="form-grid-full">
                  <span>Cible</span>
                  <input value={listeForm.cible} onChange={(e) => setListeForm({ ...listeForm, cible: e.target.value })} placeholder="Prospects, clients VIP, secteur retail…" />
                </label>
                <label className="form-grid-full">
                  <span>Description</span>
                  <textarea rows={2} value={listeForm.description} onChange={(e) => setListeForm({ ...listeForm, description: e.target.value })} />
                </label>
                <label className="form-grid-full">
                  <span>Note</span>
                  <textarea rows={2} value={listeForm.note} onChange={(e) => setListeForm({ ...listeForm, note: e.target.value })} placeholder="Détails internes, contexte…" />
                </label>
              </div>
            </div>
            <footer>
              <button type="button" className="workspace-secondary" onClick={() => setShowListeForm(false)}>
                Annuler
              </button>
              <button type="button" className="workspace-primary" onClick={() => void submitListe()} disabled={savingListe}>
                {savingListe ? 'Enregistrement…' : editingListe ? 'Enregistrer les modifications' : 'Créer la liste'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Modal contact */}
      {showContactForm && (
        <div className="workspace-modal-backdrop" onClick={() => setShowContactForm(false)}>
          <div className="workspace-modal data-entry-modal data-contact-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>{editingContact ? 'Modifier le contact' : 'Nouveau contact'}</h3>
              <button type="button" className="workspace-icon-button" onClick={() => setShowContactForm(false)} aria-label="Fermer">
                <X aria-hidden="true" />
              </button>
            </header>
            <div className="workspace-modal-body">
              <div className="form-grid">
                <label>
                  <span>Nom</span>
                  <input value={contactForm.nom} onChange={(e) => setContactForm({ ...contactForm, nom: e.target.value })} />
                </label>
                <label>
                  <span>Prénom</span>
                  <input value={contactForm.prenom} onChange={(e) => setContactForm({ ...contactForm, prenom: e.target.value })} />
                </label>
                <label className="form-grid-full">
                  <span>Raison sociale</span>
                  <input value={contactForm.reseau_social} onChange={(e) => setContactForm({ ...contactForm, reseau_social: e.target.value })} placeholder="B2B, B2C, C2C…" />
                </label>
                <label>
                  <span>Téléphone</span>
                  <input value={contactForm.telephone} onChange={(e) => setContactForm({ ...contactForm, telephone: e.target.value })} />
                </label>
                <label>
                  <span>Mobile</span>
                  <input value={contactForm.mobile} onChange={(e) => setContactForm({ ...contactForm, mobile: e.target.value })} />
                </label>
                <label className="form-grid-full">
                  <span>Adresse</span>
                  <input value={contactForm.address} onChange={(e) => setContactForm({ ...contactForm, address: e.target.value })} />
                </label>
                <label>
                  <span>Code postal</span>
                  <input value={contactForm.code_postal} onChange={(e) => setContactForm({ ...contactForm, code_postal: e.target.value })} />
                </label>
                <label>
                  <span>Ville</span>
                  <input value={contactForm.ville} onChange={(e) => setContactForm({ ...contactForm, ville: e.target.value })} />
                </label>
                <label className="form-grid-full">
                  <span>E-mail</span>
                  <input type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
                </label>
                <label className="form-grid-full">
                  <span>Profil</span>
                  <input value={contactForm.profile} onChange={(e) => setContactForm({ ...contactForm, profile: e.target.value })} placeholder="https://…" />
                </label>
                <div className="form-grid-full">
                  <span className="form-label">Listes de ce contact</span>
                  {listes.length === 0 ? (
                    <p className="form-hint">Aucune liste disponible. Créez d’abord une liste.</p>
                  ) : (
                    <div className="checkbox-grid">
                      {listes.map((l) => {
                        const checked = contactListeIds.includes(l.id)
                        return (
                          <label key={l.id} className={`checkbox-card${checked ? ' is-on' : ''}`}>
                            <input type="checkbox" checked={checked} onChange={() => toggleContactListe(l.id)} />
                            <div>
                              <strong>{l.nom}</strong>
                              <span>{l.cible || 'Sans cible'}</span>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                  {contactListeIds.length === 0 && (
                    <p className="form-error">Sélectionnez au moins une liste.</p>
                  )}
                </div>
                <label className="form-grid-full">
                  <span>Commentaire</span>
                  <textarea rows={3} value={contactForm.commentaire} onChange={(e) => setContactForm({ ...contactForm, commentaire: e.target.value })} />
                </label>
              </div>
            </div>
            <footer>
              <button type="button" className="workspace-secondary" onClick={() => setShowContactForm(false)}>
                Annuler
              </button>
              <button type="button" className="workspace-primary" onClick={() => void submitContact()} disabled={savingContact}>
                {savingContact ? 'Ajout en cours…' : editingContact ? 'Enregistrer les modifications' : 'Ajouter le contact'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Modal import */}
      {showImport && (
        <div className="workspace-modal-backdrop" onClick={() => setShowImport(false)}>
          <div className="workspace-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>Importer des contacts</h3>
              <button type="button" className="workspace-icon-button" onClick={() => setShowImport(false)} aria-label="Fermer">
                <X aria-hidden="true" />
              </button>
            </header>
            <div className="workspace-modal-body">
              <p className="workspace-import-hint">
                Importez un fichier CSV ou Excel, puis associez les colonnes de votre fichier aux champs du site. Leurs ordres peuvent être différents.
              </p>
              <div className="workspace-import-actions">
                <button type="button" className="workspace-secondary" onClick={downloadTemplate}>
                  <Download aria-hidden="true" /> Modèle CSV
                </button>
                <button type="button" className="workspace-primary" onClick={() => fileInputRef.current?.click()}>
                  <FileSpreadsheet aria-hidden="true" /> Choisir un fichier
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleFile(file)
                    e.target.value = ''
                  }}
                />
              </div>
              {importFileName && (
                <p className="workspace-import-file">
                  Fichier&nbsp;: <strong>{importFileName}</strong> — {importRows.length} ligne(s)
                </p>
              )}
              {importHeaders.length > 0 && (
                <div className="import-column-mapping">
                  <h4>Associer les colonnes</h4>
                  <p className="form-hint">Choisissez le champ du site pour chaque colonne. « Ignorer » permet de ne pas importer une colonne.</p>
                  <div className="import-mapping-grid">
                    {importHeaders.map((header) => (
                      <label className="import-mapping-row" key={header}>
                        <span title={header}>{header}</span>
                        <select value={importMapping[header] ?? ''} onChange={(event) => setImportMapping((current) => ({ ...current, [header]: event.target.value }))}>
                          <option value="">Ignorer cette colonne</option>
                          {IMPORT_FIELD_OPTIONS.map((option) => <option key={option.value} value={option.value} disabled={Object.entries(importMapping).some(([other, value]) => other !== header && value === option.value)}>{option.label}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                  <h4>Aperçu des données (5 premières lignes)</h4>
                  <div className="import-preview-wrap">
                    <table className="import-preview-table">
                      <thead><tr>{importHeaders.map((header) => <th key={header}>{header}<small>{IMPORT_FIELD_OPTIONS.find((option) => option.value === importMapping[header])?.label ?? 'Ignorée'}</small></th>)}</tr></thead>
                      <tbody>{importRows.slice(0, 5).map((row, index) => <tr key={index}>{importHeaders.map((header) => <td key={header}>{row[header] || '—'}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                  {!Object.values(importMapping).includes('nom') && !Object.values(importMapping).includes('email') && <p className="form-error">Associez au moins la colonne Nom ou E-mail pour importer.</p>}
                </div>
              )}
            </div>
            <footer>
              <button type="button" className="workspace-secondary" onClick={() => setShowImport(false)}>
                Annuler
              </button>
              <button
                type="button"
                className="workspace-primary"
                onClick={() => void confirmImport()}
                disabled={importRows.length === 0 || (!Object.values(importMapping).includes('nom') && !Object.values(importMapping).includes('email'))}
              >
                Importer {importRows.length > 0 ? `(${importRows.length})` : ''}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  )
}