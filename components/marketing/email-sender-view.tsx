'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertCircle, CheckCircle2, Mail, Plus, Send, Server, ShieldCheck, Trash2, Users, X, BarChart3, Eye, MousePointerClick, FileText } from 'lucide-react'
import type { ListeContact, ListeContactContact } from '@/lib/storage'

type SmtpAccount = {
  id: number
  name: string
  email: string
  host: string
  port: number
  secure: boolean
  username: string
  from_name: string | null
  is_active: boolean
}

interface EmailSenderViewProps {
  listes: ListeContact[]
  listeContacts: ListeContactContact[]
  isAdmin: boolean
}

const emptySmtp = {
  name: '', email: '', host: 'smtp.ionos.fr', port: '587',
  secure: false, username: '', password: '', from_name: '',
}

export function EmailSenderView({ listes, listeContacts, isAdmin }: EmailSenderViewProps) {
  const [accounts, setAccounts] = useState<SmtpAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [accountError, setAccountError] = useState('')
  const [form, setForm] = useState(emptySmtp)
  const [showForm, setShowForm] = useState(false)
  const [editingSmtpId, setEditingSmtpId] = useState<number | null>(null)
  const [smtpId, setSmtpId] = useState<number | ''>('')
  const [listeId, setListeId] = useState<number | ''>('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ total: number; sent: number; failed: number; sender: string; message: string } | null>(null)
  const [history, setHistory] = useState<{ id: number; subject: string; listeNom: string; sender: string; date: string; sent: number; failed: number; message?: string; status?: string }[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'campaigns' | 'lists' | 'templates' | 'senders' | 'unsubscribes'>('dashboard')
  const [campaignStats, setCampaignStats] = useState<any[]>([])
  const [templates, setTemplates] = useState<{ id: number; name: string; subject: string; content: string }[]>([])
  const [unsubscribes, setUnsubscribes] = useState<{ id: number; email: string; unsubscribed_at: string; source: string }[]>([])
  const [templateName, setTemplateName] = useState('')
  const [templateSubject, setTemplateSubject] = useState('')
  const [templateContent, setTemplateContent] = useState('')
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null)
  const [unsubscribeEmail, setUnsubscribeEmail] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [trackingOpens, setTrackingOpens] = useState(true)
  const [trackingClicks, setTrackingClicks] = useState(true)
  const [unsubscribeEnabled, setUnsubscribeEnabled] = useState(true)
  const [batchSize, setBatchSize] = useState(25)
  const [batchDelaySeconds, setBatchDelaySeconds] = useState(2)

  async function loadManageData() {
    const response = await fetch('/api/email/manage', { credentials: 'same-origin', cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Chargement impossible.')
    setTemplates(data.templates ?? [])
    setUnsubscribes(data.unsubscribes ?? [])
    setCampaignStats(data.campaigns ?? [])
  }

  useEffect(() => { void loadManageData().catch((error) => setAccountError(error instanceof Error ? error.message : 'Erreur de chargement.')) }, [])

  async function saveTemplate() {
    const editing = editingTemplateId !== null
    const response = await fetch('/api/email/manage', { method: editing ? 'PATCH' : 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingTemplateId, name: templateName, subject: templateSubject, content: templateContent }) })
    const data = await response.json()
    if (!response.ok) { setAccountError(data.error || 'Enregistrement impossible.'); return }
    setTemplateName(''); setTemplateSubject(''); setTemplateContent(''); setEditingTemplateId(null)
    await loadManageData()
  }

  async function removeTemplate(id: number) {
    if (!window.confirm('Supprimer ce modèle ?')) return
    const response = await fetch('/api/email/manage', { method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    const data = await response.json()
    if (!response.ok) { setAccountError(data.error || 'Suppression impossible.'); return }
    await loadManageData()
  }

  async function addUnsubscribe() {
    const response = await fetch('/api/email/manage', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unsubscribe', email: unsubscribeEmail }) })
    const data = await response.json()
    if (!response.ok) { setAccountError(data.error || 'Ajout impossible.'); return }
    setUnsubscribeEmail(''); await loadManageData()
  }

  const selectedListe = listeId === '' ? null : listes.find((item) => item.id === listeId) ?? null
  const contactCount = selectedListe ? listeContacts.filter((link) => link.liste_id === selectedListe.id).length : 0
  const activeAccounts = useMemo(() => accounts.filter((account) => account.is_active), [accounts])

  async function loadAccounts() {
    setAccountsLoading(true)
    setAccountError('')
    try {
      const response = await fetch('/api/email/smtp-accounts', { credentials: 'same-origin', cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les comptes SMTP.')
      setAccounts(data.accounts ?? [])
      if (data.accounts?.length && smtpId === '') {
        const firstActive = data.accounts.find((item: SmtpAccount) => item.is_active)
        if (firstActive) setSmtpId(firstActive.id)
      }
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Erreur de chargement.')
    } finally {
      setAccountsLoading(false)
    }
  }

  useEffect(() => { void loadAccounts() }, [])

  useEffect(() => {
    let cancelled = false
    async function loadHistory() {
      setHistoryLoading(true)
      try {
        const response = await fetch('/api/email/send', { credentials: 'same-origin', cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Historique indisponible.')
        if (!cancelled) setHistory((data.campaigns ?? []).map((item: any) => ({
          id: Number(item.id),
          subject: item.subject,
          listeNom: item.liste_nom,
          sender: item.sender_email,
          date: new Date(item.sent_at || item.created_at).toLocaleString('fr-FR'),
          sent: Number(item.sent_count),
          failed: Number(item.failed_count),
          message: item.message,
          status: item.status,
        })))
      } catch (error) {
        if (!cancelled) setAccountError(error instanceof Error ? error.message : 'Impossible de charger l’historique.')
      } finally {
        if (!cancelled) setHistoryLoading(false)
      }
    }
    void loadHistory()
    return () => { cancelled = true }
  }, [])

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setAccountError('')
    try {
      const response = await fetch('/api/email/smtp-accounts', {
        method: editingSmtpId ? 'PATCH' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...form, id: editingSmtpId, port: Number(form.port) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Création SMTP impossible.')
      setAccounts((current) => editingSmtpId ? current.map((item) => item.id === editingSmtpId ? data.account : item) : [data.account, ...current])
      setSmtpId(data.account.id)
      setForm(emptySmtp)
      setEditingSmtpId(null)
      setShowForm(false)
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Erreur pendant la sauvegarde.')
    } finally {
      setSaving(false)
    }
  }

  async function testAccount(account: SmtpAccount) {
    setAccountError('')
    const response = await fetch('/api/email/smtp-accounts', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test', id: account.id }) })
    const data = await response.json()
    if (!response.ok) setAccountError(data.error || 'Test SMTP échoué.')
    else setAccountError(data.message || 'Connexion SMTP vérifiée.')
  }

  async function toggleAccount(account: SmtpAccount) {
    const response = await fetch('/api/email/smtp-accounts', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: account.id, is_active: !account.is_active }),
    })
    const data = await response.json()
    if (!response.ok) {
      setAccountError(data.error || 'Modification impossible.')
      return
    }
    setAccounts((current) => current.map((item) => item.id === account.id ? data.account : item))
    if (account.is_active && smtpId === account.id) setSmtpId('')
  }

  async function deleteAccount(account: SmtpAccount) {
    if (!window.confirm(`Supprimer le compte SMTP ${account.email} ?`)) return
    const response = await fetch('/api/email/smtp-accounts', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: account.id }),
    })
    const data = await response.json()
    if (!response.ok) {
      setAccountError(data.error || 'Suppression impossible.')
      return
    }
    setAccounts((current) => current.filter((item) => item.id !== account.id))
    if (smtpId === account.id) setSmtpId('')
  }

  async function sendEmail() {
    if (!smtpId || !listeId || !subject.trim() || !message.trim()) {
      setAccountError('Sélectionnez un expéditeur, une liste, un objet et rédigez votre message.')
      return
    }
    setSending(true)
    setAccountError('')
    setResult(null)
    try {
      const response = await fetch('/api/email/send', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ smtp_account_id: smtpId, liste_id: listeId, subject, message, reply_to: replyTo, tracking_opens: trackingOpens, tracking_clicks: trackingClicks, unsubscribe_enabled: unsubscribeEnabled, batch_size: batchSize, batch_delay_seconds: batchDelaySeconds }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Envoi impossible.')
      setResult(data)
      setHistory((current) => [{
        id: Number(data.campaignId), subject, listeNom: selectedListe?.nom ?? '',
        sender: data.sender, date: new Date().toLocaleString('fr-FR'),
        sent: data.sent, failed: data.failed, message, status: data.failed === 0 ? 'sent' : data.sent > 0 ? 'partial' : 'failed',
      }, ...current])
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Erreur pendant l’envoi.')
    } finally {
      setSending(false)
    }
  }

  const totalSent = campaignStats.reduce((sum, item) => sum + Number(item.sent_count || 0), 0)
  const totalFailed = campaignStats.reduce((sum, item) => sum + Number(item.failed_count || 0), 0)
  const totalOpened = campaignStats.reduce((sum, item) => sum + Number(item.opened_count || 0), 0)
  const totalClicked = campaignStats.reduce((sum, item) => sum + Number(item.clicked_count || 0), 0)
  const tabItems = [
    ['dashboard', 'Dashboard'], ['campaigns', 'Campagnes'], ['lists', 'Listes'],
    ['templates', 'Templates'], ['senders', 'Expéditeurs'], ['unsubscribes', 'Désabonnements'],
  ] as const

  return (
    <section className="workspace-section" style={{ display: 'grid', gap: 18 }}>
      <div className="workspace-panel" style={{ padding: 10 }}>
        <nav aria-label="Navigation e-mail" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tabItems.map(([key, label]) => <button key={key} type="button" className={activeTab === key ? 'workspace-primary' : 'workspace-secondary'} onClick={() => setActiveTab(key)}>{label}</button>)}
        </nav>
      </div>

      {accountError && <div role="alert" className="workspace-note" style={{ color: '#b91c1c' }}><AlertCircle aria-hidden="true" /> {accountError}</div>}

      {activeTab === 'dashboard' && <>
        <div className="workspace-panel-header"><h2><BarChart3 aria-hidden="true" /> Performance des campagnes e-mail</h2><button type="button" className="workspace-secondary" onClick={() => void loadManageData()}>Actualiser</button></div>
        <div className="form-grid">
          {[
            ['Campagnes', campaignStats.length, 'Campagnes enregistrées'],
            ['E-mails envoyés', totalSent, 'Livraisons réussies'],
            ['Échecs', totalFailed, 'E-mails non envoyés'],
            ['Ouvertures', totalOpened, 'Ouvertures suivies'],
            ['Clics', totalClicked, 'Clics suivis'],
            ['Désabonnements', unsubscribes.length, 'Adresses en suppression'],
          ].map(([label, value, hint]) => <div className="workspace-panel" key={String(label)}><span className="form-hint">{label}</span><strong style={{ display: 'block', fontSize: 28, margin: '8px 0' }}>{Number(value).toLocaleString('fr-FR')}</strong><span className="form-hint">{hint}</span></div>)}
        </div>
        <div className="workspace-panel">
          <h2>Dernières campagnes</h2>
          {campaignStats.length === 0 ? <p className="form-hint">Aucune campagne pour le moment.</p> : <ul className="history-list">{campaignStats.slice(0, 8).map((item) => <li key={item.id}><div><strong>{item.subject}</strong><span>{item.sent_count} envoyé(s) · {item.failed_count} échec(s) · {item.opened_count} ouverture(s) · {item.clicked_count} clic(s)</span></div></li>)}</ul>}
        </div>
      </>}

      {activeTab === 'campaigns' && <>
        <div className="workspace-panel">
          <div className="workspace-panel-header"><h2><Send aria-hidden="true" /> Nouvelle campagne</h2><span>Envoi réel SMTP</span></div>
          <div className="form-grid">
            <label className="form-grid-full"><span>Adresse expéditrice</span><select value={smtpId} onChange={(e) => setSmtpId(e.target.value ? Number(e.target.value) : '')}><option value="">— Choisir un compte SMTP —</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.email}</option>)}</select></label>
            <label className="form-grid-full"><span>Liste cible</span><select value={listeId} onChange={(e) => setListeId(e.target.value ? Number(e.target.value) : '')}><option value="">— Sélectionner une liste —</option>{listes.map((liste) => <option key={liste.id} value={liste.id}>{liste.nom} ({listeContacts.filter((link) => link.liste_id === liste.id).length} contacts)</option>)}</select></label>
            {selectedListe && <div className="form-grid-full workspace-note"><Users aria-hidden="true" /><p><strong>{contactCount}</strong> contact(s) dans « {selectedListe.nom} ». Les adresses désabonnées sont automatiquement exclues.</p></div>}
            <label className="form-grid-full"><span>Objet</span><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Objet de votre e-mail" /></label>
            <label className="form-grid-full"><span>Répondre à (Reply-To)</span><input type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="reponse@entreprise.fr" /></label>
            <label className="form-grid-full"><span>Modèle</span><select defaultValue="" onChange={(e) => { const item = templates.find((template) => template.id === Number(e.target.value)); if (item) { setSubject(item.subject); setMessage(item.content) } }}><option value="">— Choisir un modèle —</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="form-grid-full"><span>Contenu HTML ou texte</span><textarea rows={10} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Rédigez votre message ou collez votre HTML…" /></label>
            <label><span>Emails par lot</span><input type="number" min="1" max="100" value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} /></label>
            <label><span>Délai entre les lots (secondes)</span><input type="number" min="0" max="10" value={batchDelaySeconds} onChange={(e) => setBatchDelaySeconds(Number(e.target.value))} /></label>
            <label><input type="checkbox" checked={trackingOpens} onChange={(e) => setTrackingOpens(e.target.checked)} /> Suivi des ouvertures</label>
            <label><input type="checkbox" checked={trackingClicks} onChange={(e) => setTrackingClicks(e.target.checked)} /> Suivi des clics</label>
            <label><input type="checkbox" checked={unsubscribeEnabled} onChange={(e) => setUnsubscribeEnabled(e.target.checked)} /> Lien de désabonnement</label>
          </div>
          <div className="workspace-import-actions" style={{ marginTop: 14 }}><button type="button" className="workspace-primary" onClick={() => void sendEmail()} disabled={sending || !activeAccounts.length}><Send aria-hidden="true" /> {sending ? 'Envoi en cours…' : 'Envoyer la campagne'}</button></div>
          {result && <div className="workspace-note" style={{ marginTop: 14 }}><CheckCircle2 aria-hidden="true" /><p><strong>{result.message}</strong><br />Expéditeur : {result.sender} · Réussis : {result.sent} · Échecs : {result.failed}</p></div>}
        </div>
        <div className="workspace-panel">
          <div className="workspace-panel-header"><h2>Historique des campagnes</h2><span>{campaignStats.length} campagne(s)</span></div>
          {historyLoading ? <p>Chargement…</p> : <ul className="history-list">{campaignStats.map((item) => <li key={item.id}><div><strong>{item.subject}</strong><span>{item.sent_count} envoyé(s) · {item.failed_count} échec(s) · {item.opened_count} ouverture(s) · {item.clicked_count} clic(s) · {new Date(item.created_at).toLocaleString('fr-FR')}</span></div><button type="button" className="workspace-secondary" onClick={() => { setSmtpId(item.smtp_account_id ?? ''); setListeId(item.liste_id ?? ''); setSubject(item.subject + ' (copie)'); setMessage(item.message ?? ''); setReplyTo(item.reply_to ?? ''); setTrackingOpens(item.tracking_opens !== false); setTrackingClicks(item.tracking_clicks !== false); setUnsubscribeEnabled(item.unsubscribe_enabled !== false); setBatchSize(Number(item.batch_size ?? 25)); setBatchDelaySeconds(Number(item.batch_delay_seconds ?? 2)); setActiveTab('campaigns') }}>Dupliquer</button></li>)}</ul>}
        </div>
      </>}

      {activeTab === 'lists' && <div className="workspace-panel"><div className="workspace-panel-header"><h2><Users aria-hidden="true" /> Listes de destinataires</h2><span>{listes.length} liste(s)</span></div><div className="form-grid">{listes.map((liste) => <div className="workspace-note" key={liste.id}><strong>{liste.nom}</strong><p>{listeContacts.filter((link) => link.liste_id === liste.id).length} contact(s)</p></div>)}</div><p className="form-hint">La création et la modification des listes se font dans le module « Listes & contacts ».</p></div>}

      {activeTab === 'templates' && <div className="workspace-panel">
        <div className="workspace-panel-header"><h2><FileText aria-hidden="true" /> Bibliothèque de templates</h2><span>{templates.length} modèle(s)</span></div>
        <div className="form-grid">
          <label><span>Nom du modèle</span><input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Newsletter mensuelle" /></label>
          <label><span>Objet par défaut</span><input value={templateSubject} onChange={(e) => setTemplateSubject(e.target.value)} placeholder="Votre objet" /></label>
          <label className="form-grid-full"><span>Contenu HTML ou texte</span><textarea rows={8} value={templateContent} onChange={(e) => setTemplateContent(e.target.value)} placeholder="Contenu du modèle…" /></label>
        </div>
        <div className="workspace-import-actions" style={{ marginTop: 12 }}><button type="button" className="workspace-primary" onClick={() => void saveTemplate()} disabled={!templateName.trim() || !templateContent.trim()}>{editingTemplateId ? 'Enregistrer les modifications' : 'Ajouter le modèle'}</button><button type="button" className="workspace-secondary" onClick={() => { setEditingTemplateId(null); setTemplateName(''); setTemplateSubject(''); setTemplateContent('') }}>Effacer</button></div>
        <ul className="history-list">{templates.map((item) => <li key={item.id}><div><strong>{item.name}</strong><span>{item.subject}</span></div><div style={{ display: 'flex', gap: 8 }}><button type="button" className="workspace-secondary" onClick={() => { setEditingTemplateId(item.id); setTemplateName(item.name); setTemplateSubject(item.subject); setTemplateContent(item.content) }}>Modifier</button><button type="button" className="workspace-secondary" onClick={() => { setTemplateName(item.name + ' (copie)'); setTemplateSubject(item.subject); setTemplateContent(item.content); setEditingTemplateId(null) }}>Dupliquer</button><button type="button" className="workspace-icon-button danger" aria-label="Supprimer le modèle" onClick={() => void removeTemplate(item.id)}><Trash2 /></button></div></li>)}</ul>
      </div>}

      {activeTab === 'senders' && <div className="workspace-panel">
        <div className="workspace-panel-header"><h2><Server aria-hidden="true" /> Comptes expéditeurs SMTP</h2>{isAdmin && <button type="button" className="workspace-primary" onClick={() => setShowForm((value) => !value)}><Plus /> Ajouter un e-mail</button>}</div>
        <p className="form-hint">Les mots de passe SMTP sont chiffrés côté serveur.</p>
        {accountsLoading ? <p>Chargement des comptes…</p> : accounts.length === 0 ? <div className="workspace-empty"><Mail /><p>Aucun compte expéditeur configuré.</p></div> : <div style={{ display: 'grid', gap: 8 }}>{accounts.map((account) => <div key={account.id} className="workspace-note" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><div><strong>{account.name}</strong><p>{account.email} · {account.host}:{account.port}</p><span className={account.is_active ? 'status-badge status-active' : 'status-badge'}>{account.is_active ? 'Actif' : 'Désactivé'}</span></div>{isAdmin && <div style={{ display: 'flex', gap: 8 }}><button type="button" className="workspace-secondary" onClick={() => { setEditingSmtpId(account.id); setForm({ name: account.name, email: account.email, host: account.host, port: String(account.port), secure: account.secure, username: account.username, password: '', from_name: account.from_name ?? '' }); setShowForm(true) }}>Modifier</button><button type="button" className="workspace-secondary" onClick={() => void testAccount(account)}>Tester SMTP</button><button type="button" className="workspace-secondary" onClick={() => void toggleAccount(account)}>{account.is_active ? 'Désactiver' : 'Activer'}</button><button type="button" className="workspace-icon-button danger" aria-label="Supprimer le compte SMTP" onClick={() => void deleteAccount(account)}><Trash2 /></button></div>}</div>)}</div>}
        {showForm && isAdmin && <form onSubmit={saveAccount} className="workspace-panel" style={{ marginTop: 16, padding: 16 }}><h3>{editingSmtpId ? 'Modifier le compte SMTP' : 'Ajouter un compte SMTP'}</h3><div className="form-grid"><label><span>Nom</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label><span>E-mail</span><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value, username: form.username || e.target.value })} /></label><label><span>Serveur SMTP</span><input required value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} /></label><label><span>Port</span><input required type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} /></label><label><span>Identifiant</span><input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label><label><span>Mot de passe</span><input required={!editingSmtpId} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label><label><span>Nom affiché</span><input value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} /></label><label><input type="checkbox" checked={form.secure} onChange={(e) => setForm({ ...form, secure: e.target.checked })} /> SSL/TLS direct</label></div><button type="submit" className="workspace-primary" disabled={saving}>{saving ? 'Enregistrement…' : editingSmtpId ? 'Enregistrer les modifications' : 'Enregistrer'}</button></form>}
      </div>}

      {activeTab === 'unsubscribes' && <div className="workspace-panel">
        <div className="workspace-panel-header"><h2><ShieldCheck aria-hidden="true" /> Liste globale de suppression</h2><span>{unsubscribes.length} adresse(s)</span></div>
        <p className="form-hint">Les adresses de cette liste sont automatiquement exclues de chaque nouvelle campagne.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><input type="email" value={unsubscribeEmail} onChange={(e) => setUnsubscribeEmail(e.target.value)} placeholder="adresse@exemple.fr" /><button type="button" className="workspace-primary" onClick={() => void addUnsubscribe()} disabled={!unsubscribeEmail.trim()}>Ajouter à la suppression</button></div>
        <ul className="history-list">{unsubscribes.map((item) => <li key={item.id}><div><strong>{item.email}</strong><span>Désabonné le {new Date(item.unsubscribed_at).toLocaleString('fr-FR')} · {item.source}</span></div></li>)}</ul>
      </div>}
    </section>
  )}
