'use client'

import { useState } from 'react'
import { Mail, Send, Users } from 'lucide-react'
import type { ListeContact, ListeContactContact } from '@/lib/storage'
import { useToast } from '@/components/ui/toast'

interface EmailSenderViewProps {
  listes: ListeContact[]
  listeContacts: ListeContactContact[]
}

export function EmailSenderView({ listes: allListes, listeContacts }: EmailSenderViewProps) {
  const toast = useToast()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [listeId, setListeId] = useState<number | ''>('')
  const [history, setHistory] = useState<
    { id: number; subject: string; listeNom: string; date: string }[]
  >([])

  const selectedListe = listeId === '' ? null : allListes.find((liste) => liste.id === listeId) ?? null
  const contactCount = selectedListe ? listeContacts.filter((link) => link.liste_id === selectedListe.id).length : 0

  function send() {
    if (!subject.trim() || !body.trim()) {
      toast.error('Champs requis', 'Objet et corps de l’e-mail sont obligatoires.')
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
        subject: subject.trim(),
        listeNom: selectedListe.nom,
        date: new Date().toLocaleString('fr-FR'),
      },
      ...h,
    ])
    toast.success(
      'E-mail simulé',
      `Objet « ${subject.trim()} » envoyé à ${contactCount} contact(s) de « ${selectedListe.nom} ».`,
    )
    setSubject('')
    setBody('')
  }

  return (
    <section className="workspace-section">
      <div className="workspace-panel">
        <div className="workspace-panel-header">
          <h2><Mail aria-hidden="true" /> Envoi e-mail</h2>
          <span>Simulation</span>
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
                  {l.nom} ({listeContacts.filter((link) => link.liste_id === l.id).length} contacts)
                </option>
              ))}
            </select>
          </label>

          {selectedListe && (
            <div className="form-grid-full">
              <div className="workspace-note">
                <Users aria-hidden="true" />
                <p>
                  <strong>{contactCount}</strong> contact(s) recevront l’e-mail via la liste{' '}
                  <strong>{selectedListe.nom}</strong>.
                </p>
              </div>
            </div>
          )}

          <label className="form-grid-full">
            <span>Objet</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Votre offre du mois" />
          </label>
          <label className="form-grid-full">
            <span>Corps du message</span>
            <textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
        </div>

        <div className="workspace-import-actions" style={{ marginTop: 12 }}>
          <button type="button" className="workspace-primary" onClick={send}>
            <Send aria-hidden="true" /> Envoyer
          </button>
        </div>

        <h3 className="workspace-subtitle">Historique</h3>
        {history.length === 0 ? (
          <div className="workspace-empty">
            <Mail aria-hidden="true" />
            <p>Aucun e-mail envoyé.</p>
          </div>
        ) : (
          <ul className="history-list">
            {history.map((h) => (
              <li key={h.id}>
                <div>
                  <strong>{h.subject}</strong>
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