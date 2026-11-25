'use client'

import { useState } from 'react'
import { Send, Smartphone, Users } from 'lucide-react'
import type { ListeContact, ListeContactContact } from '@/lib/storage'
import { useToast } from '@/components/ui/toast'

interface SmsSenderViewProps {
  listes: ListeContact[]
  listeContacts: ListeContactContact[]
  contactListCounts: Record<number, number>
}

export function SmsSenderView({ listes: allListes, listeContacts, contactListCounts }: SmsSenderViewProps) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [listeId, setListeId] = useState<number | ''>('')
  const [history, setHistory] = useState<
    { id: number; text: string; listeNom: string; date: string }[]
  >([])

  const selectedListe = listeId === '' ? null : allListes.find((liste) => liste.id === listeId) ?? null
  const contactCount = selectedListe ? (contactListCounts[selectedListe.id] ?? 0) : 0
  const remaining = 160 - text.length

  function send() {
    if (!text.trim()) {
      toast.error('Message vide', 'Saisis un message SMS.')
      return
    }
    if (text.length > 160) {
      toast.error('Trop long', 'Un SMS ne doit pas dépasser 160 caractères.')
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
        text: text.trim(),
        listeNom: selectedListe.nom,
        date: new Date().toLocaleString('fr-FR'),
      },
      ...h,
    ])
    toast.success(
      'SMS simulé',
      `Envoyé à ${contactCount} contact(s) de « ${selectedListe.nom} ».`,
    )
    setText('')
  }

  return (
    <section className="workspace-section">
      <div className="workspace-panel">
        <div className="workspace-panel-header">
          <h2><Smartphone aria-hidden="true" /> Envoi SMS</h2>
          <span>{remaining} caractère(s) restant(s)</span>
        </div>

        <div className="form-grid">
          <label className="form-grid-full">
            <span>Liste cible</span>
            <select
              value={listeId}
              onChange={(e) => setListeId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">— Sélectionner une liste —</option>
              {allListes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nom} ({(contactListCounts[l.id] ?? 0)} contacts)
                </option>
              ))}
            </select>
          </label>

          {selectedListe && (
            <div className="form-grid-full">
              <div className="workspace-note">
                <Users aria-hidden="true" />
                <p>
                  <strong>{contactCount}</strong> contact(s) recevront le SMS via la liste{' '}
                  <strong>{selectedListe.nom}</strong>.
                </p>
              </div>
            </div>
          )}

          <label className="form-grid-full">
            <span>Message</span>
            <textarea
              rows={5}
              value={text}
              maxLength={200}
              onChange={(e) => setText(e.target.value)}
              placeholder="Votre code promo : WELCOME10"
            />
          </label>
        </div>

        <div className="workspace-import-actions" style={{ marginTop: 12 }}>
          <button type="button" className="workspace-primary" onClick={send}>
            <Send aria-hidden="true" /> Envoyer le SMS
          </button>
        </div>

        <h3 className="workspace-subtitle">Historique</h3>
        {history.length === 0 ? (
          <div className="workspace-empty">
            <Smartphone aria-hidden="true" />
            <p>Aucun SMS envoyé.</p>
          </div>
        ) : (
          <ul className="history-list">
            {history.map((h) => (
              <li key={h.id}>
                <div>
                  <strong>{h.text}</strong>
                  <span>Liste : {h.listeNom} · {h.date}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}