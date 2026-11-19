'use client'

import { useState } from 'react'
import { KeyRound, Mail, MapPin, Phone, Save, ShieldCheck, UserRound } from 'lucide-react'
import type { User } from '@/lib/storage'
import { useToast } from '@/components/ui/toast'

interface SettingsViewProps {
  user: User
  onSaved: () => void
}

export function SettingsView({ user, onSaved }: SettingsViewProps) {
  const toast = useToast()
  const [form, setForm] = useState({
    prenom: user.prenom,
    nom: user.nom,
    email: user.email,
    telephone: user.telephone,
    address: user.address,
    password: '',
    confirmPassword: '',
  })
  const [saving, setSaving] = useState(false)

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.prenom.trim() || !form.nom.trim() || !form.email.trim()) {
      toast.error('Informations manquantes', 'Le prénom, le nom et l’e-mail sont obligatoires.')
      return
    }
    if (form.password && form.password.length < 12) {
      toast.error('Mot de passe trop court', 'Choisissez au moins 12 caractères.')
      return
    }
    if (form.password !== form.confirmPassword) {
      toast.error('Confirmation incorrecte', 'Les deux mots de passe ne correspondent pas.')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          prenom: form.prenom,
          nom: form.nom,
          email: form.email,
          telephone: form.telephone,
          address: form.address,
          password: form.password || undefined,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error ?? 'Mise à jour impossible.')

      toast.success('Profil mis à jour', 'Vos informations personnelles ont été enregistrées.')
      setForm((current) => ({ ...current, password: '', confirmPassword: '' }))
      onSaved()
    } catch (error) {
      toast.error('Enregistrement impossible', error instanceof Error ? error.message : 'Une erreur est survenue.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="workspace-section settings-page">
      <div className="settings-hero">
        <div className="settings-hero-icon"><ShieldCheck aria-hidden="true" /></div>
        <div>
          <span className="settings-eyebrow">MON ESPACE</span>
          <h2>Paramètres personnels</h2>
          <p>Gérez vos coordonnées et sécurisez votre compte depuis un seul endroit.</p>
        </div>
      </div>

      <form className="workspace-panel settings-card" onSubmit={submit}>
        <div className="settings-section-heading">
          <span className="settings-heading-icon"><UserRound aria-hidden="true" /></span>
          <div>
            <h3>Informations personnelles</h3>
            <p>Ces informations sont utilisées dans votre espace de travail.</p>
          </div>
        </div>

        <div className="settings-fields">
          <label className="settings-field">
            <span>Prénom</span>
            <input autoComplete="given-name" value={form.prenom} onChange={(e) => update('prenom', e.target.value)} required maxLength={80} />
          </label>
          <label className="settings-field">
            <span>Nom</span>
            <input autoComplete="family-name" value={form.nom} onChange={(e) => update('nom', e.target.value)} required maxLength={80} />
          </label>
          <label className="settings-field settings-field-wide">
            <span>Adresse e-mail</span>
            <div className="settings-input-icon"><Mail aria-hidden="true" /><input type="email" autoComplete="email" value={form.email} onChange={(e) => update('email', e.target.value)} required maxLength={254} /></div>
          </label>
          <label className="settings-field">
            <span>Téléphone</span>
            <div className="settings-input-icon"><Phone aria-hidden="true" /><input autoComplete="tel" value={form.telephone} onChange={(e) => update('telephone', e.target.value)} maxLength={40} /></div>
          </label>
          <label className="settings-field">
            <span>Adresse</span>
            <div className="settings-input-icon"><MapPin aria-hidden="true" /><input autoComplete="street-address" value={form.address} onChange={(e) => update('address', e.target.value)} maxLength={240} /></div>
          </label>
        </div>

        <div className="settings-divider" />
        <div className="settings-section-heading">
          <span className="settings-heading-icon settings-heading-secure"><KeyRound aria-hidden="true" /></span>
          <div>
            <h3>Sécurité du compte</h3>
            <p>Laissez ces champs vides si vous ne souhaitez pas changer votre mot de passe.</p>
          </div>
        </div>
        <div className="settings-fields settings-password-fields">
          <label className="settings-field">
            <span>Nouveau mot de passe</span>
            <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => update('password', e.target.value)} minLength={12} placeholder="12 caractères minimum" />
          </label>
          <label className="settings-field">
            <span>Confirmer le mot de passe</span>
            <input type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} minLength={12} placeholder="Retapez le mot de passe" />
          </label>
        </div>

        <div className="settings-form-footer">
          <p><ShieldCheck aria-hidden="true" /> Vos informations sont enregistrées de manière sécurisée.</p>
          <button className="workspace-primary" type="submit" disabled={saving}>
            <Save aria-hidden="true" /> {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
          </button>
        </div>
      </form>
    </section>
  )
}
