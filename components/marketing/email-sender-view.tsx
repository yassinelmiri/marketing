'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Mail, Plus, Send, Server, ShieldCheck, Trash2, Users, X } from 'lucide-react'
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
  const [smtpId, setSmtpId] = useState<number | ''>('')
  const [listeId, setListeId] = useState<number | ''>('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ total: number; sent: number; failed: number; sender: string; message: string } | null>(null)
  const [history, setHistory] = useState<{ id: number; subject: string; listeNom: string; sender: string; date: string; sent: number; failed: number }[]>([])

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

  async function saveAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setAccountError('')
    try {
      const response = await fetch('/api/email/smtp-accounts', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...form, port: Number(form.port) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Création SMTP impossible.')
      setAccounts((current) => [data.account, ...current])
      setSmtpId(data.account.id)
      setForm(emptySmtp)
      setShowForm(false)
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Erreur pendant la sauvegarde.')
    } finally {
      setSaving(false)
    }
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
        body: JSON.stringify({ smtp_account_id: smtpId, liste_id: listeId, subject, message }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Envoi impossible.')
      setResult(data)
      setHistory((current) => [{
        id: Date.now(), subject, listeNom: selectedListe?.nom ?? '',
        sender: data.sender, date: new Date().toLocaleString('fr-FR'),
        sent: data.sent, failed: data.failed,
      }, ...current])
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'Erreur pendant l’envoi.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="workspace-section" style={{ display: 'grid', gap: 18 }}>
      <div className="workspace-panel">
        <div className="workspace-panel-header">
          <h2><Server aria-hidden="true" /> Comptes expéditeurs SMTP</h2>
          {isAdmin && <button type="button" className="workspace-primary" onClick={() => setShowForm((value) => !value)}><Plus aria-hidden="true" /> Ajouter un e-mail</button>}
        </div>
        <p className="form-hint">Chaque adresse dispose de son propre serveur SMTP, identifiant et mot de passe chiffré.</p>
        {accountError && <div role="alert" className="workspace-note" style={{ color: '#b91c1c' }}><AlertCircle aria-hidden="true" /> {accountError}</div>}
        {accountsLoading ? <p>Chargement des comptes SMTP…</p> : accounts.length === 0 ? (
          <div className="workspace-empty"><Mail aria-hidden="true" /><p>Aucun compte expéditeur configuré.</p><span>{isAdmin ? 'Ajoutez votre première adresse SMTP pour activer les envois.' : 'Contactez votre administrateur pour configurer un expéditeur.'}</span></div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {accounts.map((account) => (
              <div key={account.id} className="workspace-note" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Mail aria-hidden="true" />
                  <div><strong>{account.name}</strong><div>{account.email} · {account.host}:{account.port}</div></div>
                  <span className={account.is_active ? 'status-badge status-active' : 'status-badge'}>{account.is_active ? 'Actif' : 'Désactivé'}</span>
                </div>
                {isAdmin && <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="workspace-secondary" onClick={() => void toggleAccount(account)}>{account.is_active ? 'Désactiver' : 'Activer'}</button>
                  <button type="button" className="workspace-icon-button danger" aria-label="Supprimer le compte SMTP" onClick={() => void deleteAccount(account)}><Trash2 aria-hidden="true" /></button>
                </div>}
              </div>
            ))}
          </div>
        )}
        {showForm && isAdmin && (
          <form onSubmit={saveAccount} className="workspace-panel" style={{ marginTop: 16, padding: 16 }}>
            <div className="workspace-panel-header"><h3>Ajouter un compte SMTP</h3><button type="button" className="workspace-icon-button" onClick={() => setShowForm(false)}><X aria-hidden="true" /></button></div>
            <div className="form-grid">
              <label><span>Nom du compte</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="IONOS - Contact" /></label>
              <label><span>Adresse e-mail expéditrice</span><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value, username: form.username || e.target.value })} placeholder="contact@domaine.fr" /></label>
              <label><span>Serveur SMTP</span><input required value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="smtp.ionos.fr" /></label>
              <label><span>Port</span><input required type="number" min="1" max="65535" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} /></label>
              <label><span>Identifiant SMTP</span><input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Adresse ou identifiant SMTP" /></label>
              <label><span>Mot de passe SMTP</span><input required type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
              <label><span>Nom affiché (optionnel)</span><input value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} placeholder="Votre entreprise" /></label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={form.secure} onChange={(e) => setForm({ ...form, secure: e.target.checked })} /> Connexion SSL/TLS directe (port 465)</label>
            </div>
            <div className="workspace-import-actions" style={{ marginTop: 12 }}><button type="submit" className="workspace-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer le compte SMTP'}</button></div>
          </form>
        )}
      </div>

      <div className="workspace-panel">
        <div className="workspace-panel-header"><h2><Send aria-hidden="true" /> Nouvelle campagne e-mail</h2><span>Envoi réel SMTP</span></div>
        <div className="form-grid">
          <label className="form-grid-full"><span>Adresse expéditrice</span><select value={smtpId} onChange={(e) => setSmtpId(e.target.value ? Number(e.target.value) : '')}><option value="">— Choisir un compte SMTP —</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.email}</option>)}</select></label>
          <label className="form-grid-full"><span>Liste cible</span><select value={listeId} onChange={(e) => setListeId(e.target.value ? Number(e.target.value) : '')}><option value="">— Sélectionner une liste —</option>{listes.map((liste) => <option key={liste.id} value={liste.id}>{liste.nom} ({listeContacts.filter((link) => link.liste_id === liste.id).length} contacts)</option>)}</select></label>
          {selectedListe && <div className="form-grid-full workspace-note"><Users aria-hidden="true" /><p><strong>{contactCount}</strong> contact(s) liés à « {selectedListe.nom} ». Les adresses invalides et doublons seront ignorés.</p></div>}
          <label className="form-grid-full"><span>Objet</span><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Objet de votre e-mail" /></label>
          <label className="form-grid-full"><span>Message</span><textarea rows={9} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Rédigez votre message ici…" /></label>
        </div>
        <div className="workspace-import-actions" style={{ marginTop: 14 }}><button type="button" className="workspace-primary" onClick={() => void sendEmail()} disabled={sending || !activeAccounts.length}><Send aria-hidden="true" /> {sending ? 'Envoi en cours…' : 'Envoyer les e-mails'}</button></div>
        {result && <div className="workspace-note" style={{ marginTop: 14 }}><CheckCircle2 aria-hidden="true" /><p><strong>{result.message}</strong><br />Expéditeur : {result.sender} · Réussis : {result.sent} · Échecs : {result.failed}</p></div>}
      </div>

      <div className="workspace-panel">
        <div className="workspace-panel-header"><h2><ShieldCheck aria-hidden="true" /> Historique de cette session</h2><span>{history.length} envoi(s)</span></div>
        {history.length === 0 ? <div className="workspace-empty"><Mail aria-hidden="true" /><p>Aucun envoi pour le moment.</p></div> : <ul className="history-list">{history.map((item) => <li key={item.id}><div><strong>{item.subject}</strong><span>{item.sender} · {item.listeNom} · {item.date} · {item.sent} envoyé(s), {item.failed} échec(s)</span></div></li>)}</ul>}
      </div>
    </section>
  )
}
