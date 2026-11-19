'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  MessageCircle, Send, Users, RefreshCw, Pencil, Trash2, Check, X,
  Paperclip, FileText, Image as ImageIcon, Download, LoaderCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@/lib/storage'

type ChatAttachment = {
  id: number
  user_id: number
  file_name: string
  mime_type: string
  file_size: number
  signed_url: string | null
}
type ChatMessage = {
  id: number
  user_id: number
  message: string
  created_at: string
  profile: { id: number; prenom: string; nom: string } | null
  attachments: ChatAttachment[]
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}
function clock(value: string) {
  return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}
function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}
function isImage(type: string) {
  return type.startsWith('image/')
}

export function TeamChatView({ user }: { user: User }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [pendingFiles, setPendingFiles] = useState<ChatAttachment[]>([])
  const fileInput = useRef<HTMLInputElement | null>(null)
  const supabase = useMemo(() => createClient(), [])
  const bottom = useRef<HTMLDivElement | null>(null)

  async function load() {
    try {
      const response = await fetch('/api/chat', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Chat indisponible.')
      setMessages(Array.isArray(data.messages) ? data.messages : [])
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const channel = supabase.channel('team-chat-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_chat_messages' }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_chat_attachments' }, () => { void load() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function uploadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (pendingFiles.length >= 5) {
      setError('Vous pouvez joindre 5 fichiers maximum par message.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('La taille maximale par fichier est de 10 Mo.')
      return
    }
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch('/api/chat/attachments', { method: 'POST', body: form })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Envoi du fichier impossible.')
      setPendingFiles((current) => [...current, data.attachment])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erreur pendant l’envoi du fichier.')
    } finally {
      setUploading(false)
    }
  }

  async function saveEdit(id: number) {
    const message = editText.trim()
    if (!message) return
    try {
      const response = await fetch('/api/chat', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, message }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Modification impossible.')
      setMessages((current) => current.map((item) => item.id === id ? { ...item, ...data.message } : item))
      setEditingId(null)
      setEditText('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erreur')
    }
  }

  async function deleteMessage(id: number) {
    if (!window.confirm('Supprimer ce message et ses pièces jointes ?')) return
    try {
      const response = await fetch('/api/chat', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Suppression impossible.')
      setMessages((current) => current.filter((item) => item.id !== id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erreur')
    }
  }

  async function removePendingFile(id: number) {
    try {
      const response = await fetch('/api/chat/attachments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Suppression impossible.')
      setPendingFiles((current) => current.filter((file) => file.id !== id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Suppression du fichier impossible.')
    }
  }

  async function send(event?: FormEvent) {
    event?.preventDefault()
    const message = text.trim()
    if ((!message && pendingFiles.length === 0) || sending || uploading) return
    setSending(true)
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, attachmentIds: pendingFiles.map((file) => file.id) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Envoi impossible.')
      setMessages((current) => current.some((item) => item.id === data.message.id) ? current : [...current, data.message])
      setText('')
      // Recharger depuis le serveur pour confirmer la persistance réelle.
      await load()
      setPendingFiles([])
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erreur')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="workspace-section chatz-page">
      <div className="chatz-panel">
        <header className="chatz-header">
          <div className="chatz-icon"><MessageCircle aria-hidden="true" /></div>
          <div className="chatz-heading-copy">
            <h2>Chat d’équipe</h2>
            <p><span className="chatz-online" /> Espace de discussion · Messages et fichiers partagés</p>
          </div>
          <span className="chatz-secure-label"><Users size={13} /> Équipe privée</span>
          <button type="button" onClick={() => void load()} title="Actualiser" aria-label="Actualiser le chat">
            <RefreshCw size={17} />
          </button>
        </header>

        <div className="chatz-messages" aria-live="polite">
          {loading ? (
            <div className="chatz-empty"><LoaderCircle size={25} className="chatz-spinner" />Chargement des messages…</div>
          ) : messages.length === 0 ? (
            <div className="chatz-empty">
              <div className="chatz-empty-icon"><MessageCircle size={28} /></div>
              <strong>Bienvenue dans le chat d’équipe</strong>
              <p>Échangez avec vos collègues et partagez vos documents en toute sécurité.</p>
            </div>
          ) : messages.map((item) => {
            const name = ((item.profile?.prenom ?? '') + ' ' + (item.profile?.nom ?? '')).trim() || 'Membre'
            const own = item.user_id === user.id
            return (
              <article className={'chatz-message ' + (own ? 'own' : '')} key={item.id}>
                <span className="chatz-avatar">{initials(name) || '?'}</span>
                <div className="chatz-message-content">
                  <div className="chatz-message-head">
                    <strong>{own ? 'Vous' : name}</strong>
                    <time dateTime={item.created_at}>{clock(item.created_at)}</time>
                  </div>
                  {editingId === item.id ? (
                    <div className="chatz-edit-box">
                      <textarea value={editText} maxLength={2000} onChange={(event) => setEditText(event.target.value)} />
                      <div>
                        <button type="button" onClick={() => void saveEdit(item.id)} disabled={!editText.trim()}><Check size={14} />Enregistrer</button>
                        <button type="button" onClick={() => { setEditingId(null); setEditText('') }}><X size={14} />Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {item.message && <div className="chatz-bubble">{item.message}</div>}
                      {item.attachments?.length > 0 && (
                        <div className="chatz-attachments">
                          {item.attachments.map((attachment) => (
                            <a
                              className={'chatz-attachment ' + (isImage(attachment.mime_type) ? 'is-image' : '')}
                              href={attachment.signed_url ?? '#'}
                              target="_blank"
                              rel="noreferrer"
                              download={attachment.file_name}
                              key={attachment.id}
                              onClick={(event) => { if (!attachment.signed_url) event.preventDefault() }}
                            >
                              {isImage(attachment.mime_type) && attachment.signed_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={attachment.signed_url} alt={attachment.file_name} loading="lazy" />
                              ) : (
                                <span className="chatz-file-icon">{isImage(attachment.mime_type) ? <ImageIcon size={19} /> : <FileText size={19} />}</span>
                              )}
                              <span className="chatz-file-copy">
                                <strong>{attachment.file_name}</strong>
                                <small>{fileSize(attachment.file_size)}</small>
                              </span>
                              <Download size={15} className="chatz-download-icon" />
                            </a>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {own && editingId !== item.id && (
                    <div className="chatz-message-actions">
                      <button type="button" title="Modifier" aria-label="Modifier le message" onClick={() => { setEditingId(item.id); setEditText(item.message) }}><Pencil size={13} /></button>
                      <button type="button" title="Supprimer" aria-label="Supprimer le message" onClick={() => void deleteMessage(item.id)}><Trash2 size={13} /></button>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
          <div ref={bottom} />
        </div>

        {error && <p className="chatz-error" role="alert">{error}</p>}
        {pendingFiles.length > 0 && (
          <div className="chatz-pending-files">
            {pendingFiles.map((file) => (
              <div className="chatz-pending-file" key={file.id}>
                {isImage(file.mime_type) ? <ImageIcon size={16} /> : <FileText size={16} />}
                <span>{file.file_name}</span>
                <small>{fileSize(file.file_size)}</small>
                <button type="button" aria-label={`Retirer ${file.file_name}`} onClick={() => void removePendingFile(file.id)}><X size={14} /></button>
              </div>
            ))}
          </div>
        )}
        <form className="chatz-compose" onSubmit={send}>
          <input
            ref={fileInput}
            type="file"
            className="chatz-file-input"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={uploadFile}
            aria-label="Choisir un fichier à partager"
          />
          <button
            type="button"
            className="chatz-attach-button"
            title="Joindre un fichier (10 Mo maximum)"
            aria-label="Joindre un fichier"
            disabled={uploading || pendingFiles.length >= 5}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? <LoaderCircle size={18} className="chatz-spinner" /> : <Paperclip size={18} />}
          </button>
          <textarea
            rows={1}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }}
            placeholder="Écrire un message… (Entrée pour envoyer)"
            maxLength={2000}
            aria-label="Votre message"
          />
          <button type="submit" disabled={sending || uploading || (!text.trim() && pendingFiles.length === 0)} aria-label="Envoyer le message">
            <Send size={18} />{sending ? '…' : 'Envoyer'}
          </button>
        </form>
        <footer className="chatz-footer">Fichiers privés · Jusqu’à 10 Mo par fichier · Images, PDF, TXT, DOCX et XLSX</footer>
      </div>
    </section>
  )
}
