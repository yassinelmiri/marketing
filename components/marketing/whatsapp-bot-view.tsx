'use client'

import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import * as XLSX from 'xlsx'
import {
  AlertCircle, CheckCircle2, CircleHelp, ExternalLink, FileSpreadsheet,
  MessageCircle, Pause, Play, RefreshCw, SkipForward, Upload, XCircle,
} from 'lucide-react'
import type { ListeContact, ListeContactContact } from '@/lib/storage'

type ContactStatus = 'pending' | 'opened' | 'sent' | 'failed' | 'skipped'
type WhatsAppContact = { id: string; name: string; phone: string; status: ContactStatus }
type WhatsAppBotViewProps = { listes: ListeContact[]; listeContacts: ListeContactContact[] }

const PHONE_KEYS = ['telephone', 'téléphone', 'tel', 'tél', 'phone', 'mobile', 'gsm', 'whatsapp', 'numero', 'numéro', 'رقم', 'هاتف']
const NAME_KEYS = ['nom complet', 'fullname', 'full name', 'name', 'nom', 'contact', 'prenom', 'prénom']

function normalizePhone(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const raw = String(value).trim()
  if (!raw || raw.toLowerCase() === 'nan' || /e\+\d+$/i.test(raw)) return null
  let digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('00212')) digits = digits.slice(5)
  else if (digits.startsWith('212')) digits = digits.slice(3)
  if (digits.startsWith('0') && digits.length === 10) digits = digits.slice(1)
  if (digits.length === 9 && /^[567]/.test(digits)) return '212' + digits
  if (digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0')) return digits
  return null
}

function findColumn(headers: string[], candidates: string[]): string | null {
  const normalized = headers.map((header) => ({
    original: header,
    key: header.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\u0600-\u06ff]/g, ''),
  }))
  for (const candidate of candidates) {
    const key = candidate.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\u0600-\u06ff]/gi, '').toLowerCase()
    const match = normalized.find((item) => item.key === key || item.key.includes(key))
    if (match) return match.original
  }
  return null
}

export function WhatsAppBotView({ listes: _listes, listeContacts: _listeContacts }: WhatsAppBotViewProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [contacts, setContacts] = useState<WhatsAppContact[]>([])
  const [message, setMessage] = useState('')
  const [fileName, setFileName] = useState('')
  const [duplicates, setDuplicates] = useState(0)
  const [invalid, setInvalid] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [consentConfirmed, setConsentConfirmed] = useState(false)
  const [paused, setPaused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const current = contacts[activeIndex] ?? null
  const stats = useMemo(() => ({
    total: contacts.length,
    sent: contacts.filter((item) => item.status === 'sent').length,
    failed: contacts.filter((item) => item.status === 'failed').length,
    skipped: contacts.filter((item) => item.status === 'skipped').length,
    pending: contacts.filter((item) => item.status === 'pending' || item.status === 'opened').length,
  }), [contacts])
  const progress = stats.total ? Math.round(((stats.sent + stats.failed + stats.skipped) / stats.total) * 100) : 0
  const completed = stats.total > 0 && stats.pending === 0

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setError('')
    setNotice('')
    try {
      const extension = file.name.split('.').pop()?.toLowerCase()
      if (!['xlsx', 'xls', 'csv'].includes(extension ?? '')) throw new Error('Choisissez un fichier XLSX, XLS ou CSV.')
      if (file.size > 15 * 1024 * 1024) throw new Error('Le fichier dépasse 15 Mo.')
      const source = extension === 'csv' ? await file.text() : await file.arrayBuffer()
      const workbook = XLSX.read(source, { type: extension === 'csv' ? 'string' : 'array', raw: false })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!firstSheet) throw new Error('Le fichier ne contient aucune feuille lisible.')
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '', raw: false })
      if (!rows.length) throw new Error('Aucun contact trouvé dans le fichier.')
      const headers = Object.keys(rows[0])
      const phoneColumn = findColumn(headers, PHONE_KEYS) ?? headers[0]
      const nameColumn = findColumn(headers, NAME_KEYS)
      const seen = new Set<string>()
      const parsed: WhatsAppContact[] = []
      let duplicateCount = 0
      let invalidCount = 0
      rows.forEach((row, index) => {
        const phone = normalizePhone(row[phoneColumn])
        if (!phone) {
          if (String(row[phoneColumn] ?? '').trim()) invalidCount += 1
          return
        }
        if (seen.has(phone)) { duplicateCount += 1; return }
        seen.add(phone)
        const name = nameColumn ? String(row[nameColumn] ?? '').trim() : ''
        parsed.push({ id: String(index) + '-' + phone, name, phone, status: 'pending' })
      })
      if (!parsed.length) throw new Error('Aucun numéro valide trouvé dans la colonne « ' + phoneColumn + ' ».')
      setContacts(parsed)
      setActiveIndex(0)
      setFileName(file.name)
      setDuplicates(duplicateCount)
      setInvalid(invalidCount)
      setConsentConfirmed(false)
      setPaused(false)
      setNotice(parsed.length + ' numéro(s) importé(s) avec succès.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de lire ce fichier.')
    } finally {
      event.target.value = ''
    }
  }

  function openWhatsAppHome() {
    window.open('https://web.whatsapp.com/', 'wa-campaign')
  }

  function openCurrentChat() {
    if (!current || paused || !consentConfirmed) return
    const personalized = message.replaceAll('{nom}', current.name || '').replaceAll('{tel}', '+' + current.phone)
    const url = 'https://web.whatsapp.com/send?phone=' + encodeURIComponent(current.phone) + '&text=' + encodeURIComponent(personalized)
    const tab = window.open(url, 'wa-campaign')
    if (!tab) {
      setError('Le navigateur a bloqué la fenêtre. Autorisez les pop-ups pour ce site puis réessayez.')
      return
    }
    setContacts((items) => items.map((item, index) => index === activeIndex ? { ...item, status: 'opened' } : item))
    setError('')
    setNotice('Conversation ouverte. Vérifiez le destinataire et cliquez vous-même sur Envoyer dans WhatsApp.')
  }

  function completeCurrent(status: 'sent' | 'failed' | 'skipped') {
    if (!current) return
    setContacts((items) => items.map((item, index) => index === activeIndex ? { ...item, status } : item))
    const next = contacts.findIndex((item, index) => index > activeIndex && (item.status === 'pending' || item.status === 'opened'))
    if (next >= 0) setActiveIndex(next)
    else if (activeIndex < contacts.length - 1) setActiveIndex(activeIndex + 1)
    setNotice(status === 'sent' ? 'Envoi confirmé manuellement.' : status === 'failed' ? 'Contact marqué en échec.' : 'Contact ignoré.')
  }

  function exportResults() {
    const rows = contacts.map((contact) => ({
      Nom: contact.name,
      Telephone: '+' + contact.phone,
      Statut: contact.status === 'sent' ? 'Envoyé (confirmé manuellement)' : contact.status === 'failed' ? 'Échec' : contact.status === 'skipped' ? 'Ignoré' : contact.status === 'opened' ? 'Conversation ouverte' : 'En attente',
    }))
    const sheet = XLSX.utils.json_to_sheet(rows)
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'Suivi WhatsApp')
    XLSX.writeFile(book, 'suivi-campagne-whatsapp.xlsx')
  }

  function resetCampaign() {
    setContacts([])
    setMessage('')
    setFileName('')
    setDuplicates(0)
    setInvalid(0)
    setActiveIndex(0)
    setPaused(false)
    setConsentConfirmed(false)
    setError('')
    setNotice('')
  }

  return (
    <section className="workspace-section wa-campaign">
      <div className="wa-hero">
        <div className="wa-hero-icon"><MessageCircle aria-hidden="true" /></div>
        <div className="wa-hero-copy">
          <span className="wa-eyebrow">MESSAGERIE · MODE ASSISTÉ</span>
          <h2>Campagnes WhatsApp</h2>
          <p>Importez vos contacts, préparez votre message et envoyez-le manuellement, un destinataire à la fois depuis WhatsApp Web.</p>
        </div>
        <span className="wa-mode-pill"><span /> Envoi manuel</span>
      </div>

      <div className="wa-notice">
        <CircleHelp aria-hidden="true" />
        <p>Cette intégration ouvre WhatsApp Web dans un autre onglet. Vous devez scanner le QR code si nécessaire, vérifier chaque conversation et cliquer vous-même sur <strong>Envoyer</strong>. Aucun message n’est envoyé automatiquement.</p>
      </div>

      {error && <div className="wa-alert wa-alert-error"><AlertCircle aria-hidden="true" />{error}<button type="button" onClick={() => setError('')} aria-label="Fermer"><XCircle /></button></div>}
      {notice && <div className="wa-alert wa-alert-success"><CheckCircle2 aria-hidden="true" />{notice}<button type="button" onClick={() => setNotice('')} aria-label="Fermer"><XCircle /></button></div>}

      <div className="wa-grid">
        <div className="workspace-panel wa-panel">
          <div className="wa-panel-heading">
            <div><span className="wa-step">01</span><div><h3>Importer les contacts</h3><p>Fichier Excel ou CSV</p></div></div>
            <FileSpreadsheet aria-hidden="true" />
          </div>
          <button type="button" className="wa-upload-zone" onClick={() => fileInput.current?.click()}>
            <span className="wa-upload-icon"><Upload aria-hidden="true" /></span>
            <strong>{fileName || 'Choisir un fichier'}</strong>
            <span>Formats acceptés : .xlsx, .xls, .csv · 15 Mo maximum</span>
            <small>Colonnes reconnues : Téléphone, Tél, Phone, Mobile, GSM, Numéro…</small>
          </button>
          <input ref={fileInput} className="wa-hidden-input" type="file" accept=".xlsx,.xls,.csv" onChange={importFile} />
          {contacts.length > 0 && (
            <div className="wa-import-summary">
              <div><strong>{stats.total}</strong><span>Numéros retenus</span></div>
              <div><strong>{duplicates}</strong><span>Doublons retirés</span></div>
              <div><strong>{invalid}</strong><span>Numéros invalides</span></div>
            </div>
          )}
        </div>

        <div className="workspace-panel wa-panel">
          <div className="wa-panel-heading">
            <div><span className="wa-step">02</span><div><h3>Préparer le message</h3><p>Personnalisez le texte si besoin</p></div></div>
            <MessageCircle aria-hidden="true" />
          </div>
          <label className="wa-field">
            <span>Votre message</span>
            <textarea rows={7} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={'Bonjour {nom},\n\nNous vous contactons au sujet de...'} />
          </label>
          <div className="wa-token-hint">Variables disponibles : <code>{'{nom}'}</code> pour le nom · <code>{'{tel}'}</code> pour le numéro</div>
          <label className="wa-consent">
            <input type="checkbox" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} />
            <span>Je confirme que ces contacts ont accepté de recevoir mes messages WhatsApp.</span>
          </label>
        </div>
      </div>

      <div className="workspace-panel wa-panel wa-connection-panel">
        <div className="wa-panel-heading">
          <div><span className="wa-step">03</span><div><h3>Connecter WhatsApp Web</h3><p>Ouvrir une session dans un nouvel onglet</p></div></div>
          <ExternalLink aria-hidden="true" />
        </div>
        <div className="wa-connect-row">
          <div><strong>WhatsApp Web</strong><span>Scannez le QR code avec votre téléphone si la session n’est pas déjà ouverte.</span></div>
          <button type="button" className="workspace-primary wa-action-button" onClick={openWhatsAppHome}><ExternalLink aria-hidden="true" /> Ouvrir WhatsApp Web</button>
        </div>
      </div>

      {contacts.length > 0 && (
        <div className="workspace-panel wa-panel wa-progress-panel">
          <div className="wa-progress-top">
            <div><span className="wa-step">04</span><div><h3>Suivi de la campagne</h3><p>{fileName} · {stats.total} destinataire(s)</p></div></div>
            <div className="wa-progress-actions">
              <button type="button" className="wa-secondary-button" onClick={() => setPaused((value) => !value)}>{paused ? <Play /> : <Pause />}{paused ? 'Reprendre' : 'Pause'}</button>
              <button type="button" className="wa-secondary-button" onClick={exportResults}>Exporter le suivi</button>
              <button type="button" className="wa-icon-button" onClick={resetCampaign} aria-label="Réinitialiser"><RefreshCw /></button>
            </div>
          </div>
          <div className="wa-stat-row">
            <div><strong>{stats.total}</strong><span>Total</span></div>
            <div><strong>{stats.sent}</strong><span>Confirmés</span></div>
            <div><strong>{stats.failed}</strong><span>Échecs</span></div>
            <div><strong>{stats.skipped}</strong><span>Ignorés</span></div>
            <div><strong>{stats.pending}</strong><span>À traiter</span></div>
          </div>
          <div className="wa-progress-track"><span style={{ width: progress + '%' }} /></div>
          <div className="wa-progress-caption"><span>{progress}% traité</span><span>{completed ? 'Campagne terminée' : paused ? 'Campagne en pause' : 'Campagne en cours'}</span></div>

          {!completed && current && (
            <div className="wa-current-contact">
              <div className="wa-current-label">DESTINATAIRE ACTUEL · {activeIndex + 1} / {stats.total}</div>
              <div className="wa-current-details"><div className="wa-contact-avatar">{(current.name || '+').charAt(0).toUpperCase()}</div><div><strong>{current.name || 'Contact sans nom'}</strong><span>+{current.phone}</span></div><span className={'wa-status wa-status-' + current.status}>{current.status === 'opened' ? 'Conversation ouverte' : 'En attente'}</span></div>
              <div className="wa-current-actions">
                <button type="button" className="workspace-primary wa-action-button" disabled={paused || !consentConfirmed || !message.trim()} onClick={openCurrentChat}><ExternalLink /> Ouvrir la conversation</button>
                <button type="button" className="wa-secondary-button" disabled={paused || current.status !== 'opened'} onClick={() => completeCurrent('sent')}><CheckCircle2 /> Envoyé</button>
                <button type="button" className="wa-secondary-button" disabled={paused || current.status !== 'opened'} onClick={() => completeCurrent('failed')}><XCircle /> Échec</button>
                <button type="button" className="wa-secondary-button" disabled={paused} onClick={() => completeCurrent('skipped')}><SkipForward /> Ignorer</button>
              </div>
              {!consentConfirmed && <p className="wa-inline-warning">Confirmez le consentement des destinataires avant de commencer.</p>}
              {current.status === 'opened' && <p className="wa-inline-hint">Après avoir cliqué sur Envoyer dans WhatsApp, revenez ici et confirmez avec « Envoyé ».</p>}
            </div>
          )}
          {completed && <div className="wa-complete"><CheckCircle2 /><div><strong>Campagne terminée</strong><span>Vous pouvez exporter le résultat détaillé ci-dessus.</span></div></div>}
          <div className="wa-table-wrap">
            <table className="wa-table"><thead><tr><th>Contact</th><th>Téléphone</th><th>Statut</th></tr></thead><tbody>
              {contacts.slice(Math.max(0, activeIndex - 2), Math.min(contacts.length, activeIndex + 5)).map((contact) => (
                <tr key={contact.id} className={contact.id === current?.id ? 'is-current' : ''}><td>{contact.name || '—'}</td><td>+{contact.phone}</td><td><span className={'wa-status wa-status-' + contact.status}>{contact.status === 'sent' ? 'Confirmé' : contact.status === 'failed' ? 'Échec' : contact.status === 'skipped' ? 'Ignoré' : contact.status === 'opened' ? 'Ouvert' : 'En attente'}</span></td></tr>
              ))}
            </tbody></table>
          </div>
        </div>
      )}

      <p className="wa-footnote"><AlertCircle aria-hidden="true" /> WhatsApp Web et les automatisations non officielles peuvent être soumis à des restrictions. Utilisez uniquement des listes avec consentement et respectez les demandes de désinscription.</p>
    </section>
  )
}
