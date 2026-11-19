
'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  UserRound,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'

type AuthMode = 'login' | 'register'

interface AuthPageProps {
  mode: AuthMode
}

const highlights = [
  { icon: Mail, label: 'Campagnes e-mail' },
  { icon: MessageCircle, label: 'WhatsApp' },
  { icon: Smartphone, label: 'SMS' },
  { icon: BarChart3, label: 'Suivi des performances' },
]

function Brand() {
  return (
    <span className="landing-brand">
      <span className="landing-brand-symbol" aria-hidden="true">
        <i /><i />
      </span>
      <span className="landing-brand-name">
        anntel<span>marketing</span>
      </span>
    </span>
  )
}

export function AuthPage({ mode }: AuthPageProps) {
  const isLogin = mode === 'login'
  const toast = useToast()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setInfo(null)

    const cleanEmail = email.trim().toLowerCase()

    if (!cleanEmail || !password) {
      const msg = 'Veuillez renseigner votre e-mail et votre mot de passe.'
      setError(msg)
      toast.error('Champs incomplets', msg)
      return
    }

    if (!isLogin) {
      if (!fullName.trim()) {
        const msg = 'Veuillez indiquer votre nom complet.'
        setError(msg)
        toast.error('Nom requis', msg)
        return
      }

      if (password.length < 12) {
        const msg = 'Le mot de passe doit contenir au moins 12 caractères.'
        setError(msg)
        toast.error('Mot de passe trop court', msg)
        return
      }

      if (password !== confirmPassword) {
        const msg = 'Les mots de passe ne correspondent pas.'
        setError(msg)
        toast.error('Confirmation invalide', msg)
        return
      }
    }

    setLoading(true)

    try {
      const supabase = createClient()

      if (isLogin) {
        // Connexion avec Supabase Auth
        const { data, error: authError } =
          await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          })

        if (authError) {
          throw new Error(
            'Identifiants invalides. Vérifiez votre e-mail et votre mot de passe.'
          )
        }

        if (!data.user) {
          throw new Error('Utilisateur introuvable.')
        }

        // Vérification du profil utilisateur
        const { data: profile, error: profileError } =
          await supabase
            .from('user_profiles')
            .select('id, prenom, nom, email, role_id')
            .eq('auth_user_id', data.user.id)
            .single()

        if (profileError || !profile) {
          await supabase.auth.signOut()
          throw new Error(
            'Votre compte est connecté, mais votre profil est introuvable. Contactez l’administrateur.'
          )
        }

        toast.success(
          'Connexion réussie',
          `Bienvenue ${profile.prenom ?? ''} !`
        )

        setInfo('Connexion réussie, redirection…')

        window.location.assign('/workspace')
        return
      }

      // Création du compte avec Supabase Auth
      const { data, error: signUpError } =
        await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
          },
        })

      if (signUpError) {
        throw new Error(signUpError.message)
      }

      if (!data.user) {
        throw new Error('Impossible de créer le compte.')
      }

      // Si la confirmation e-mail est activée dans Supabase
      if (!data.session) {
        setInfo(
          'Votre compte a été créé. Consultez votre boîte e-mail pour confirmer votre inscription avant de vous connecter.'
        )

        toast.success(
          'Compte créé',
          'Vérifiez votre boîte e-mail pour confirmer votre inscription.'
        )

        return
      }

      // Si la confirmation e-mail n'est pas activée,
      // le trigger crée automatiquement le profil membre.
      const { data: profile, error: profileError } =
        await supabase
          .from('user_profiles')
          .select('id, prenom, nom, email, role_id')
          .eq('auth_user_id', data.user.id)
          .single()

      if (profileError || !profile) {
        throw new Error(
          'Compte créé, mais le profil est introuvable. Vérifiez le trigger Supabase.'
        )
      }

      toast.success(
        'Compte créé',
        `Bienvenue ${profile.prenom ?? ''} !`
      )

      setInfo('Compte créé, redirection…')
      window.location.assign('/workspace')
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : 'Erreur inattendue, veuillez réessayer.'

      setError(msg)
      toast.error('Opération échouée', msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <aside className="auth-aside" aria-hidden="true">
        <Link className="auth-brand-link" href="/" aria-label="Retour à l’accueil">
          <Brand />
        </Link>

        <div className="auth-aside-content">
          <span className="landing-eyebrow">
            <i /> PLATEFORME DE MARKETING MULTICANAL
          </span>

          <h1>
            {isLogin
              ? <>Reprenez la main sur vos <span>campagnes.</span></>
              : <>Créez votre espace <span>marketing d’équipe.</span></>}
          </h1>

          <p>
            Organisez vos campagnes e-mail, WhatsApp et SMS dans un espace
            unique, pensé pour votre équipe.
          </p>

          <ul className="auth-highlights">
            {highlights.map(({ icon: Icon, label }) => (
              <li key={label}>
                <span className="auth-highlight-icon">
                  <Icon aria-hidden="true" />
                </span>
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="auth-aside-footer">
          <ShieldCheck aria-hidden="true" />
          <span>Vos données sont protégées par Supabase.</span>
        </div>
      </aside>

      <main className="auth-main">
        <Link className="auth-back-link" href="/">
          <ArrowLeft aria-hidden="true" /> Retour à l’accueil
        </Link>

        <div className="auth-card">
          <header className="auth-card-header">
            <h2>{isLogin ? 'Connexion' : 'Créer un compte'}</h2>
            <p>
              {isLogin
                ? 'Accédez à votre espace de travail Anntel Marketing.'
                : 'Quelques informations et vous êtes prêt à démarrer.'}
            </p>
          </header>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {!isLogin && (
              <label className="auth-field">
                <span>Nom complet</span>
                <div className="auth-input">
                  <UserRound aria-hidden="true" />
                  <input
                    type="text"
                    autoComplete="name"
                    placeholder="Jeanne Dupont"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </label>
            )}

            <label className="auth-field">
              <span>Adresse e-mail</span>
              <div className="auth-input">
                <Mail aria-hidden="true" />
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="vous@entreprise.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>
            </label>

            <label className="auth-field">
              <span>Mot de passe</span>
              <div className="auth-input">
                <Lock aria-hidden="true" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="auth-toggle-password"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword
                      ? 'Masquer le mot de passe'
                      : 'Afficher le mot de passe'
                  }
                  tabIndex={-1}
                >
                  {showPassword
                    ? <EyeOff aria-hidden="true" />
                    : <Eye aria-hidden="true" />}
                </button>
              </div>
            </label>

            {!isLogin && (
              <label className="auth-field">
                <span>Confirmer le mot de passe</span>
                <div className="auth-input">
                  <Lock aria-hidden="true" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </label>
            )}

            {isLogin && (
              <div className="auth-row-between">
                <label className="auth-checkbox">
                  <input type="checkbox" disabled={loading} />
                  <span>Se souvenir de moi</span>
                </label>
                <span className="auth-link">
                  Mot de passe oublié ?
                </span>
              </div>
            )}

            {!isLogin && (
              <label className="auth-checkbox">
                <input type="checkbox" required disabled={loading} />
                <span>
                  J’accepte les{' '}
                  <a href="#" className="auth-link">
                    conditions d’utilisation
                  </a>{' '}
                  et la{' '}
                  <a href="#" className="auth-link">
                    politique de confidentialité
                  </a>.
                </span>
              </label>
            )}

            {error && (
              <p className="auth-error" role="alert">{error}</p>
            )}

            {info && !error && (
              <p className="auth-info" role="status">{info}</p>
            )}

            <button
              className="auth-submit"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 aria-hidden="true" className="auth-spinner" />
                  Traitement…
                </>
              ) : (
                <>
                  {isLogin ? 'Se connecter' : 'Créer mon compte'}
                  <ArrowRight aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <footer className="auth-card-footer">
            {isLogin ? (
              <p>
                Pas encore de compte ?{' '}
                <Link className="auth-link" href="/register">
                  Créer un compte
                </Link>
              </p>
            ) : (
              <p>
                Déjà un compte ?{' '}
                <Link className="auth-link" href="/login">
                  Se connecter
                </Link>
              </p>
            )}
          </footer>
        </div>

        <p className="auth-legal">
          Vos données sont sécurisées et gérées via Supabase.
        </p>
      </main>
    </div>
  )
}
