'use client'

import { useState } from 'react'
import { Bot, MessageCircle, Send, Users } from 'lucide-react'
import { listesRepo } from '@/lib/storage'
import { useToast } from '@/components/ui/toast'

export function WhatsAppBotView() {
  const toast = useToast()
  const [message, setMessage] = useState('')
  const [target, setTarget] = useState('tous')
  const [listeId, setListeId] = useState<number | ''>('')
  const [history, setHistory] = useState<
    { id: number; text: string; target: string; listeNom: string; date: string }[]
  >([])

  const allListes = listesRepo.all()
  const selectedListe = listeId === '' ? null : listesRepo.byId(listeId)
  const contactCount = selectedListe ? listesRepo.contactsOf(selectedListe.id).length : 0

  function send() {
    if (!message.trim()) {
      toast.error('Message vide', 'Saisis un message à envoyer.')
      return
    }
    if (!selectedListe) {
      toast.error('Liste requise', 'Sélectionne une liste cible.')
      return
    }
    if (contactCount === 0) {
      toast.error('Liste vide', 'Cette liste ne contient aucun contact.')
      return
    }

    setHistory((h) => [
      {
        id: Date.now(),
        text: message.trim(),
        target,
        listeNom: selectedListe.nom,
        date: new Date().toLocaleString('fr-FR'),
      },
      ...h,
    ])
    toast.success(
      'Message WhatsApp simulé',
      `Envoyé à « ${selectedListe.nom} » (${contactCount} contacts).`,
    )
    setMessage('')
  }

  return (
    <section className="workspace-section">
      <div className="workspace-panel">
        <div className="workspace-panel-header">
          <h2><Bot aria-hidden="true" /> Bot WhatsApp</h2>
          <span>Simulation</span>
        </div>
        <p className="workspace-import-hint">
          Cette console permet de préparer un message WhatsApp et d’en simuler l’envoi.
          L’intégration réelle (Twilio, WhatsApp Business API) sera branchée après la mise en place du backend.
        </p>

        <div className="form-grid">
          <label className="form-grid-full">
            <span>Catégorie cible</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="tous">Tous les contacts</option>
              <option value="prospects">Prospects uniquement</option>
              <option value="clients">Clients existants</option>
            </select>
          </label>

          <label className="form-grid-full">
            <span>Liste cible</span>
            <select
              value={listeId}
              onChange={(e) => setListeId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">— Sélectionner une liste —</option>
              {allListes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nom} ({listesRepo.contactsOf(l.id).length} contacts)
                </option>
              ))}
            </select>
          </label>

          {selectedListe && (
            <div className="form-grid-full">
              <div className="workspace-note">
                <Users aria-hidden="true" />
                <p>
                  <strong>{contactCount}</strong> contact(s) recevront le message via la liste{' '}
                  <strong>{selectedListe.nom}</strong>.
                </p>
              </div>
            </div>
          )}

          <label className="form-grid-full">
            <span>Message</span>
            <textarea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Bonjour 👋 Voici notre nouveauté…"
            />
          </label>
        </div>

        <div className="workspace-import-actions" style={{ marginTop: 12 }}>
          <button type="button" className="workspace-primary" onClick={send}>
            <Send aria-hidden="true" /> Envoyer le message
          </button>
        </div>

        <h3 className="workspace-subtitle">Historique</h3>
        {history.length === 0 ? (
          <div className="workspace-empty">
            <MessageCircle aria-hidden="true" />
            <p>Aucun message envoyé.</p>
          </div>
        ) : (
          <ul className="history-list">
            {history.map((h) => (
              <li key={h.id}>
                <div>
                  <strong>{h.text}</strong>
                  <span>Liste : {h.listeNom} · Cible : {h.target} · {h.date}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}