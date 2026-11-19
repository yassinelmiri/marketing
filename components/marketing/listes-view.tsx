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
} from 'lucide-react'
import {
  CONTACT_IMPORT_COLUMNS,
  parseCsv,
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
  deleteContact as deleteContactInDb,
  setContactListes,
  setCampagneListes,
  importContactsToListe,
} from '@/lib/supabase/marketing-data'
import { useToast } from '@/components/ui/toast'
import { formatDate } from './shared'

interface ListesViewProps {
  user: User
  listes: ListeContact[]
  contacts: Contact[]
  campagnes: Campagne[]
  campagneListes: CampagneListe[]
  listeContacts: ListeContactContact[]
  teamUsers: User[]
  onRefresh: () => void
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
  campagne_ids: [] as number[],
}

export function ListesView({ user, listes, contacts, campagnes, campagneListes, listeContacts: contactLinks, teamUsers, onRefresh }: ListesViewProps) {
  const toast = useToast()

  const [selectedListeId, setSelectedListeId] = useState<number | null>(listes[0]?.id ?? null)

  const [showListeForm, setShowListeForm] = useState(false)
  const [editingListe, setEditingListe] = useState<ListeContact | null>(null)
  const [listeForm, setListeForm] = useState(emptyListeForm)

  const [showContactForm, setShowContactForm] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [contactForm, setContactForm] = useState(emptyContactForm)
  const [contactListeIds, setContactListeIds] = useState<number[]>([])

  const [showImport, setShowImport] = useState(false)
  const [importRows, setImportRows] = useState<Record<string, string>[]>([])
  const [importFileName, setImportFileName] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Les listes arrivent après le chargement Supabase; sélectionner la première automatiquement.
  useEffect(() => {
    if (!listes.some((liste) => liste.id === selectedListeId)) {
      setSelectedListeId(listes[0]?.id ?? null)
    }
  }, [listes, selectedListeId])

  const allCampagnes = campagnes
  const selectedListe = listes.find((l) => l.id === selectedListeId) ?? null
  const listeContacts = useMemo(() => {
    if (!selectedListe) return []
    const ids = new Set(contactLinks.filter((link) => link.liste_id === selectedListe.id).map((link) => link.contact_id))
    return contacts.filter((c) => ids.has(c.id))
  }, [contacts, selectedListe, contactLinks])

  // ── Handlers liste ───────────────────────────────────
  function openCreateListe() {
    setEditingListe(null)
    const me = user
    setListeForm({
      nom: '',
      description: '',
      cible: '',
      note: '',
      ajoute_par_nom: `${me.prenom} ${me.nom}`.trim(),
      date_creation: new Date().toISOString().slice(0, 16),
      campagne_ids: [],
    })
    setShowListeForm(true)
  }
  function openEditListe(l: ListeContact) {
    setEditingListe(l)
    const linkedCampagnes = campagneListes
      .filter((link) => link.liste_id === l.id)
      .map((link) => link.campagne_id)
    setListeForm({
      nom: l.nom,
      description: l.description,
      cible: l.cible ?? '',
      note: l.note ?? '',
      ajoute_par_nom: l.ajoute_par_nom ?? '',
      date_creation: (l.date_creation ?? new Date().toISOString()).slice(0, 16),
      campagne_ids: linkedCampagnes,
    })
    setShowListeForm(true)
  }
  function toggleCampagneInListe(campagneId: number) {
    setListeForm((f) => ({
      ...f,
      campagne_ids: f.campagne_ids.includes(campagneId)
        ? f.campagne_ids.filter((id) => id !== campagneId)
        : [...f.campagne_ids, campagneId],
    }))
  }
  async function submitListe() {
    if (!listeForm.nom.trim()) {
      toast.error('Nom requis', 'Donnez un nom à la liste.')
      return
    }

    try {
      let listeId: number
      if (editingListe) {
        await updateListe(editingListe.id, {
          nom: listeForm.nom.trim(),
          description: listeForm.description,
          cible: listeForm.cible,
          note: listeForm.note,
          ajoute_par_nom: listeForm.ajoute_par_nom,
        })
        listeId = editingListe.id
      } else {
        const created = await createListe({
          nom: listeForm.nom.trim(),
          description: listeForm.description,
          cible: listeForm.cible,
          note: listeForm.note,
          ajoute_par_nom: listeForm.ajoute_par_nom,
          created_by: user.id,
        })
        listeId = created.id
        setSelectedListeId(created.id)
      }

      for (const campaign of campagnes) {
        const linked = campagneListes.some((link) => link.campagne_id === campaign.id && link.liste_id === listeId)
        const shouldLink = listeForm.campagne_ids.includes(campaign.id)
        if (linked !== shouldLink) {
          const currentIds = campagneListes.filter((link) => link.campagne_id === campaign.id).map((link) => link.liste_id)
          await setCampagneListes(campaign.id, shouldLink ? [...currentIds, listeId] : currentIds.filter((id) => id !== listeId))
        }
      }

      toast.success(editingListe ? 'Liste mise à jour' : 'Liste créée')
      setShowListeForm(false)
      await onRefresh()
    } catch (error) {
      toast.error('Enregistrement impossible', error instanceof Error ? error.message : 'Erreur Supabase.')
    }
  }
  async function deleteListe(l: ListeContact) {
    if (!confirm(`Supprimer la liste « ${l.nom} » et ses contacts ?`)) return
    try {
      await deleteListeInDb(l.id)
      if (selectedListeId === l.id) setSelectedListeId(null)
      toast.success('Liste supprimée', `« ${l.nom} » retirée.`)
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
    if (!contactForm.nom.trim() && !contactForm.email.trim()) {
      toast.error('Champs requis', 'Nom ou e-mail obligatoire.')
      return
    }
    if (contactListeIds.length === 0) {
      toast.error('Liste requise', 'Sélectionnez au moins une liste pour ce contact.')
      return
    }
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
      await onRefresh()
    } catch (error) {
      toast.error('Enregistrement impossible', error instanceof Error ? error.message : 'Erreur Supabase.')
    }
  }
  async function deleteContact(c: Contact) {
    if (!confirm(`Supprimer ${c.prenom} ${c.nom} ?`)) return
    try {
      await deleteContactInDb(c.id)
      toast.success('Contact supprimé', 'Retiré.')
      await onRefresh()
    } catch (error) {
      toast.error('Suppression impossible', error instanceof Error ? error.message : 'Erreur Supabase.')
    }
  }

  // ── Import CSV ───────────────────────────────────────
  async function handleFile(file: File) {
    setImportFileName(file.name)
    const lower = file.name.toLowerCase()
    if (lower.endsWith('.csv')) {
      const text = await file.text()
      const { rows } = parseCsv(text)
      setImportRows(rows)
      toast.success('CSV analysé', `${rows.length} ligne(s) détectée(s).`)
      return
    }
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      try {
        const XLSX = await import('xlsx')
        const buffer = await file.arrayBuffer()
        const wb = XLSX.read(buffer, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
        const rows = json.map((row) => {
          const obj: Record<string, string> = {}
          Object.entries(row).forEach(([k, v]) => {
            obj[String(k).trim()] = v == null ? '' : String(v)
          })
          return obj
        })
        setImportRows(rows)
        toast.success('XLSX analysé', `${rows.length} ligne(s) détectée(s).`)
      } catch (e) {
        console.error(e)
        toast.error('Erreur XLSX', 'Installez « xlsx » (npm i xlsx) ou convertissez en CSV.')
      }
      return
    }
    toast.error('Format non supporté', 'Choisissez un fichier .csv ou .xlsx.')
  }
  async function confirmImport() {
    if (!selectedListe) return
    if (importRows.length === 0) {
      toast.error('Aucune donnée', 'Aucune ligne à importer.')
      return
    }
    try {
      const res = await importContactsToListe(selectedListe.id, user.id, importRows)
      if (res.created > 0) toast.success('Import terminé', `${res.created} contact(s) créé(s).`)
      if (res.errors.length > 0) toast.error('Import partiel', `${res.errors.length} erreur(s).`)
      setShowImport(false)
      setImportRows([])
      setImportFileName('')
      await onRefresh()
    } catch (error) {
      toast.error('Import impossible', error instanceof Error ? error.message : 'Erreur Supabase.')
    }
  }
  function downloadTemplate() {
    const headers = CONTACT_IMPORT_COLUMNS.join(',')
    const example =
      'Dupont,Jeanne,LinkedIn,+212600000000,+212611111111,12 rue X,75001,Paris,jeanne@exemple.com,https://linkedin.com/in/jeanne,Client VIP'
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
    <section className="workspace-section">
      <div className="listes-layout">
        {/* Colonne 1 : listes */}
        <div className="workspace-panel">
          <div className="workspace-panel-header">
            <h2><FolderPlus aria-hidden="true" /> Listes</h2>
            <button type="button" className="workspace-primary" onClick={openCreateListe}>
              <Plus aria-hidden="true" /> Nouvelle liste
            </button>
          </div>
          {listes.length === 0 ? (
            <div className="workspace-empty">
              <FolderPlus aria-hidden="true" />
              <p>Aucune liste.</p>
              <span>Créez votre première liste pour organiser vos contacts.</span>
            </div>
          ) : (
            <ul className="bases-list">
              {listes.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    className={`liste-item${selectedListeId === l.id ? ' is-active' : ''}`}
                    onClick={() => setSelectedListeId(l.id)}
                  >
                    <div>
                      <strong>{l.nom}</strong>
                      <span>
                        {contactLinks.filter((link) => link.liste_id === l.id).length} contact(s) · {l.cible || 'Sans cible'}
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
            </ul>
          )}
        </div>

        {/* Colonne 2 : contacts de la liste */}
        <div className="workspace-panel">
          <div className="workspace-panel-header">
            <h2>
              <Users aria-hidden="true" />
              {selectedListe ? `Contacts · ${selectedListe.nom}` : 'Contacts'}
            </h2>
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
          {!selectedListe ? (
            <div className="workspace-empty">
              <Users aria-hidden="true" />
              <p>Sélectionnez une liste.</p>
            </div>
          ) : listeContacts.length === 0 ? (
            <div className="workspace-empty">
              <Users aria-hidden="true" />
              <p>Aucun contact dans cette liste.</p>
              <span>Ajoutez un contact ou importez un CSV/XLSX.</span>
            </div>
          ) : (
            <div className="campagne-table-wrap">
              <table className="campagne-table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Contact</th>
                    <th>Ville</th>
                    <th>Listes</th>
                    <th>Ajouté</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {listeContacts.map((c) => {
                    const author = teamUsers.find((member) => member.id === c.created_by)
                    const contactListes = contactLinks.filter((link) => link.contact_id === c.id).map((link) => listes.find((liste) => liste.id === link.liste_id)).filter((liste): liste is ListeContact => Boolean(liste))
                    return (
                      <tr key={c.id}>
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
                        <td>{contactListes.map((l) => l.nom).join(', ') || '—'}</td>
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
                          <button type="button" className="danger" onClick={() => void deleteContact(c)} aria-label="Supprimer">
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

      {/* Modal liste */}
      {showListeForm && (
        <div className="workspace-modal-backdrop" onClick={() => setShowListeForm(false)}>
          <div className="workspace-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
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
                <label>
                  <span>Ajouté par</span>
                  <input value={listeForm.ajoute_par_nom} onChange={(e) => setListeForm({ ...listeForm, ajoute_par_nom: e.target.value })} placeholder="Nom de la personne" />
                </label>
                <label>
                  <span>Date de création</span>
                  <input type="datetime-local" value={listeForm.date_creation} onChange={(e) => setListeForm({ ...listeForm, date_creation: e.target.value })} />
                </label>
                <div className="form-grid-full">
                  <span className="form-label">Campagnes associées</span>
                  {allCampagnes.length === 0 ? (
                    <p className="form-hint">Aucune campagne disponible. Créez d’abord une campagne.</p>
                  ) : (
                    <div className="checkbox-grid">
                      {allCampagnes.map((c) => {
                        const checked = listeForm.campagne_ids.includes(c.id)
                        return (
                          <label key={c.id} className={`checkbox-card${checked ? ' is-on' : ''}`}>
                            <input type="checkbox" checked={checked} onChange={() => toggleCampagneInListe(c.id)} />
                            <div>
                              <strong>{c.titre}</strong>
                              <span>{c.cible || 'Sans cible'}</span>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <footer>
              <button type="button" className="workspace-secondary" onClick={() => setShowListeForm(false)}>
                Annuler
              </button>
              <button type="button" className="workspace-primary" onClick={() => void submitListe()}>
                {editingListe ? 'Enregistrer' : 'Créer la liste'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Modal contact */}
      {showContactForm && (
        <div className="workspace-modal-backdrop" onClick={() => setShowContactForm(false)}>
          <div className="workspace-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
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
                  <span>Réseau social</span>
                  <input value={contactForm.reseau_social} onChange={(e) => setContactForm({ ...contactForm, reseau_social: e.target.value })} placeholder="LinkedIn, Facebook…" />
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
              <button type="button" className="workspace-primary" onClick={() => void submitContact()}>
                {editingContact ? 'Enregistrer' : 'Ajouter le contact'}
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
                Colonnes&nbsp;: <code>{CONTACT_IMPORT_COLUMNS.join(', ')}</code>. Nom ou e-mail obligatoire.
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
            </div>
            <footer>
              <button type="button" className="workspace-secondary" onClick={() => setShowImport(false)}>
                Annuler
              </button>
              <button
                type="button"
                className="workspace-primary"
                onClick={() => void confirmImport()}
                disabled={importRows.length === 0}
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