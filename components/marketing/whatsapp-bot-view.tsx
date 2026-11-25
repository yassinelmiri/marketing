'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  AlertCircle, CheckCircle2, CircleHelp, ExternalLink, FileSpreadsheet,
  MessageCircle, Pause, Play, RefreshCw, SkipForward, Upload, XCircle,
} from 'lucide-react'
import { parseWhatsAppImportFile, type WhatsAppImportContact, type WhatsAppContactStatus } from '@/lib/whatsapp/file-parser'

type ContactStatus = WhatsAppContactStatus
type WhatsAppContact = WhatsAppImportContact
type SavedWhatsAppCampaign = { id: number; name: string; source_file: string; message: string; status: 'draft' | 'in_progress' | 'paused' | 'completed'; total_recipients: number; updated_at: string }

export function WhatsAppBotView() {
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
  const [campaignId, setCampaignId] = useState<number | null>(null)
  const [savedCampaigns, setSavedCampaigns] = useState<SavedWhatsAppCampaign[]>([])
  const [savedCounts, setSavedCounts] = useState<{ total: number; sent: number; failed: number; skipped: number; pending: number } | null>(null)
  const [savedPage, setSavedPage] = useState(1)
  const [savedTotalPages, setSavedTotalPages] = useState(1)
  const [selectedSavedId, setSelectedSavedId] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingSaved, setLoadingSaved] = useState(false)
  const [nextDelaySeconds, setNextDelaySeconds] = useState(5)
  const [advanceCountdown, setAdvanceCountdown] = useState(false)
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshSavedCampaigns = useCallback(async () => {
    setLoadingSaved(true)
    try {
      const response = await fetch('/api/whatsapp/campaigns', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Chargement des campagnes impossible.')
      setSavedCampaigns(data.campaigns ?? [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chargement des campagnes impossible.')
    } finally {
      setLoadingSaved(false)
    }
  }, [])

  useEffect(() => {
    void refreshSavedCampaigns()
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    }
  }, [refreshSavedCampaigns])

  const current = contacts[activeIndex] ?? null
  const localStats = useMemo(() => contacts.reduce((counts, contact) => {
    counts.total += 1

    switch (contact.status) {
      case 'sent':
        counts.sent += 1
        break
      case 'failed':
        counts.failed += 1
        break
      case 'skipped':
        counts.skipped += 1
        break
      case 'pending':
      case 'opened':
        counts.pending += 1
        break
    }

    return counts
  }, { total: 0, sent: 0, failed: 0, skipped: 0, pending: 0 }), [contacts])
  const stats = campaignId && savedCounts ? savedCounts : localStats
  const progress = stats.total ? Math.round(((stats.sent + stats.failed + stats.skipped) / stats.total) * 100) : 0
  const completed = stats.total > 0 && stats.pending === 0

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setError('')
    setNotice('')
    try {
      const { contacts: parsed, duplicates: duplicateCount, invalid: invalidCount } = await parseWhatsAppImportFile(file)
      setContacts(parsed)
      setCampaignId(null)
      setSavedCounts(null)
      setSavedPage(1)
      setSavedTotalPages(1)
      setSelectedSavedId('')
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

  async function persistRecipientStatus(contact: WhatsAppContact, status: ContactStatus) {
    if (!campaignId) return
    try {
      const response = await fetch('/api/whatsapp/campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId, recipient_id: Number(contact.id), recipient_status: status }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Enregistrement du suivi impossible.')
      void refreshSavedCampaigns()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enregistrement du suivi impossible.')
    }
  }

  function openCurrentChat() {
    if (!current || paused || !consentConfirmed || !campaignId) return
    const personalized = message.replaceAll('{nom}', current.name || '').replaceAll('{tel}', '+' + current.phone)
    const url = 'https://web.whatsapp.com/send?phone=' + encodeURIComponent(current.phone) + '&text=' + encodeURIComponent(personalized)
    const tab = window.open(url, 'wa-campaign')
    if (!tab) {
      setError('Le navigateur a bloqué la fenêtre. Autorisez les pop-ups pour ce site puis réessayez.')
      return
    }
    setContacts((items) => items.map((item, index) => index === activeIndex ? { ...item, status: 'opened' } : item))
    void persistRecipientStatus(current, 'opened')
    setError('')
    setNotice('Conversation ouverte. Vérifiez le destinataire et cliquez vous-même sur Envoyer dans WhatsApp.')
  }

  async function completeCurrent(status: 'sent' | 'failed' | 'skipped') {
    if (!current || !campaignId) return
    try {
      const response = await fetch('/api/whatsapp/campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId, recipient_id: Number(current.id), recipient_status: status }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Enregistrement du suivi impossible.')
      setContacts((items) => items.map((item, index) => index === activeIndex ? { ...item, status } : item))
      if (data.counts) setSavedCounts(data.counts)
      const next = contacts.findIndex((item, index) => index > activeIndex && (item.status === 'pending' || item.status === 'opened'))
      const nextIndex = next >= 0 ? next : activeIndex < contacts.length - 1 ? activeIndex + 1 : -1
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
      if (nextIndex >= 0 || (savedPage < savedTotalPages && campaignId)) {
        setAdvanceCountdown(nextDelaySeconds > 0)
        advanceTimerRef.current = setTimeout(() => {
          if (nextIndex >= 0) setActiveIndex(nextIndex)
          else if (campaignId) void loadSavedCampaign(campaignId, savedPage + 1)
          setAdvanceCountdown(false)
          advanceTimerRef.current = null
        }, nextDelaySeconds * 1000)
      }
      setNotice(status === 'sent' ? 'Confirmation manuelle sauvegardée.' : status === 'failed' ? 'Contact marqué en échec.' : 'Contact ignoré.')
      void refreshSavedCampaigns()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enregistrement du suivi impossible.')
    }
  }

  async function loadSavedCampaign(id: number, page = 1) {
    setError('')
    try {
      const response = await fetch('/api/whatsapp/campaigns?id=' + id + '&page=' + page + '&pageSize=50', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Chargement de la campagne impossible.')
      const restored = (data.recipients ?? []).map((row: { id: number; contact_name: string; phone: string; status: ContactStatus }) => ({
        id: String(row.id), name: row.contact_name ?? '', phone: row.phone, status: row.status,
      })) as WhatsAppContact[]
      setCampaignId(Number(data.campaign.id))
      setSelectedSavedId(String(data.campaign.id))
      setContacts(restored)
      setSavedCounts(data.counts ?? null)
      setSavedPage(Number(data.page ?? page))
      setSavedTotalPages(Number(data.totalPages ?? 1))
      setMessage(data.campaign.message ?? '')
      setFileName(data.campaign.source_file || data.campaign.name)
      setConsentConfirmed(Boolean(data.campaign.consent_confirmed_at))
      setPaused(data.campaign.status === 'paused')
      const firstOpen = restored.findIndex((item) => item.status === 'pending' || item.status === 'opened')
      setActiveIndex(firstOpen >= 0 ? firstOpen : Math.max(0, restored.length - 1))
      if (firstOpen < 0 && page < Number(data.totalPages ?? 1)) {
        if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
        advanceTimerRef.current = setTimeout(() => {
          void loadSavedCampaign(id, page + 1)
          advanceTimerRef.current = null
        }, 0)
      }
      setDuplicates(0)
      setInvalid(0)
      setNotice('Campagne restaurée. Le suivi a été récupéré depuis Supabase.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chargement de la campagne impossible.')
    }
  }

  async function saveCampaign() {
    if (!contacts.length || !message.trim() || !consentConfirmed || saving) return
    setSaving(true)
    setError('')
    try {
      if (campaignId) {
        const response = await fetch('/api/whatsapp/campaigns', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaign_id: campaignId, message }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Enregistrement du message impossible.')
        setNotice('Message de la campagne sauvegardé.')
      } else {
        const response = await fetch('/api/whatsapp/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: fileName.replace(/\.[^.]+$/, '') || 'Campagne WhatsApp',
            source_file: fileName,
            message,
            consent_confirmed: true,
            recipients: contacts.map((contact) => ({ name: contact.name, phone: contact.phone })),
          }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Création de la campagne impossible.')
        await loadSavedCampaign(Number(data.campaign.id))
        setNotice('Campagne enregistrée dans Supabase. Vous pouvez commencer.')
      }
      void refreshSavedCampaigns()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enregistrement de la campagne impossible.')
    } finally {
      setSaving(false)
    }
  }

  async function togglePause() {
    if (!campaignId) return
    const nextPaused = !paused
    try {
      const response = await fetch('/api/whatsapp/campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId, status: nextPaused ? 'paused' : 'in_progress' }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Modification de la campagne impossible.')
      setPaused(nextPaused)
      setNotice(nextPaused ? 'Campagne mise en pause et sauvegardée.' : 'Campagne reprise.')
      void refreshSavedCampaigns()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Modification de la campagne impossible.')
    }
  }

  async function exportResults() {
    const XLSX = await import('xlsx')
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
    setCampaignId(null)
    setSelectedSavedId('')
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

      <div className="workspace-panel wa-panel wa-saved-panel">
        <div className="wa-panel-heading">
          <div><span className="wa-step">00</span><div><h3>Mes campagnes sauvegardées</h3><p>Reprenez une campagne et son dernier état enregistré</p></div></div>
          <RefreshCw aria-hidden="true" />
        </div>
        <div className="wa-saved-row">
          <select value={selectedSavedId} onChange={(event) => setSelectedSavedId(event.target.value)}>
            <option value="">Choisir une campagne existante</option>
            {savedCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name} · {campaign.total_recipients} contacts · {campaign.status === 'paused' ? 'En pause' : campaign.status === 'completed' ? 'Terminée' : campaign.status === 'in_progress' ? 'En cours' : 'Brouillon'}</option>)}
          </select>
          <button type="button" className="wa-secondary-button" disabled={!selectedSavedId || loadingSaved} onClick={() => void loadSavedCampaign(Number(selectedSavedId))}>Charger la campagne</button>
          <button type="button" className="wa-icon-button" disabled={loadingSaved} onClick={() => void refreshSavedCampaigns()} aria-label="Actualiser"><RefreshCw /></button>
        </div>
        {savedCampaigns.length === 0 && <p className="wa-saved-empty">{loadingSaved ? 'Chargement…' : 'Aucune campagne sauvegardée pour le moment.'}</p>}
      </div>

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
              <button type="button" className="wa-secondary-button" onClick={() => void saveCampaign()} disabled={!consentConfirmed || !message.trim() || saving}>{saving ? 'Enregistrement…' : campaignId ? 'Sauvegarder le message' : 'Enregistrer la campagne'}</button>
              <button type="button" className="wa-secondary-button" onClick={() => void togglePause()} disabled={!campaignId}>{paused ? <Play /> : <Pause />}{paused ? 'Reprendre' : 'Pause'}</button>
              <button type="button" className="wa-secondary-button" onClick={exportResults}>Exporter le suivi</button>
              <button type="button" className="wa-icon-button" onClick={resetCampaign} aria-label="Réinitialiser"><RefreshCw /></button>
            </div>
          </div>
          <div className="wa-queue-settings">
            <label htmlFor="wa-next-delay">Délai avant le contact suivant</label>
            <div><input id="wa-next-delay" type="number" min={0} max={120} value={nextDelaySeconds} onChange={(event) => setNextDelaySeconds(Math.min(120, Math.max(0, Number(event.target.value) || 0)))} /><span>secondes</span></div>
            <small>Après votre confirmation manuelle, le contact suivant sera sélectionné automatiquement. L’envoi dans WhatsApp reste manuel.</small>
          </div>
          {campaignId && savedTotalPages > 1 && <div className="wa-batch-indicator">Lot {savedPage} / {savedTotalPages} · 50 destinataires maximum chargés à la fois</div>}
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
              <div className="wa-current-label">DESTINATAIRE ACTUEL · {(savedPage - 1) * 50 + activeIndex + 1} / {stats.total}</div>
              <div className="wa-current-details"><div className="wa-contact-avatar">{(current.name || '+').charAt(0).toUpperCase()}</div><div><strong>{current.name || 'Contact sans nom'}</strong><span>+{current.phone}</span></div><span className={'wa-status wa-status-' + current.status}>{current.status === 'opened' ? 'Conversation ouverte' : 'En attente'}</span></div>
              <div className="wa-current-actions">
                <button type="button" className="workspace-primary wa-action-button" disabled={paused || !campaignId || !consentConfirmed || !message.trim()} onClick={openCurrentChat}><ExternalLink /> Ouvrir la conversation</button>
                <button type="button" className="wa-secondary-button" disabled={paused || current.status !== 'opened'} onClick={() => completeCurrent('sent')}><CheckCircle2 /> Envoyé</button>
                <button type="button" className="wa-secondary-button" disabled={paused || current.status !== 'opened'} onClick={() => completeCurrent('failed')}><XCircle /> Échec</button>
                <button type="button" className="wa-secondary-button" disabled={paused} onClick={() => completeCurrent('skipped')}><SkipForward /> Ignorer</button>
              </div>
              {!consentConfirmed && <p className="wa-inline-warning">Confirmez le consentement des destinataires avant d’enregistrer la campagne.</p>}
              {!campaignId && <p className="wa-inline-warning">Enregistrez d’abord la campagne pour activer le suivi persistant et l’ouverture des conversations.</p>}
              {current.status === 'opened' && <p className="wa-inline-hint">Après avoir cliqué sur Envoyer dans WhatsApp, revenez ici et confirmez avec « Envoyé ».</p>}
              {advanceCountdown && <p className="wa-inline-hint">Contact suivant dans {nextDelaySeconds} seconde(s)…</p>}
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
