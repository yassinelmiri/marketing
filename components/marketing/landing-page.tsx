'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronDown,
  ContactRound,
  Mail,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  TrendingUp,
  UsersRound,
  Zap,
} from 'lucide-react'

/* ============================================================
   Illustrations 3D — SVG inline animés
   ============================================================ */

function HeroIllustration() {
  return (
    <div className="hero-photo-composition">
      <div className="hero-photo-main">
        <img
          src="https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1400&q=90"
          alt="Équipe marketing en pleine collaboration dans un bureau moderne"
          fetchPriority="high"
        />
        <div className="hero-photo-caption">
          <span className="hero-photo-live-dot" />
          <span>Une équipe. Tous vos canaux.</span>
        </div>
      </div>
      <div className="hero-photo-float hero-photo-float-top">
        <span className="hero-photo-float-icon"><Mail /></span>
        <span><strong>Campagnes e-mail</strong><small>Centralisées et suivies</small></span>
      </div>
      <div className="hero-photo-float hero-photo-float-bottom">
        <span className="hero-photo-float-icon is-green"><MessageCircle /></span>
        <span><strong>WhatsApp & SMS</strong><small>Communication simplifiée</small></span>
      </div>
      <div className="hero-photo-orbit" aria-hidden="true" />
    </div>
  )
}

function Feature3DIcon({ tone }: { tone: string }) {
  const palettes: Record<string, { bg: string; fg: string; hi: string }> = {
    'feature-teal': { bg: '#0d9488', fg: '#5eead4', hi: '#ccfbf1' },
    'feature-blue': { bg: '#2563eb', fg: '#93c5fd', hi: '#dbeafe' },
    'feature-green': { bg: '#16a34a', fg: '#86efac', hi: '#dcfce7' },
    'feature-amber': { bg: '#f59e0b', fg: '#fde68a', hi: '#fffbeb' },
    'feature-lilac': { bg: '#7c3aed', fg: '#c4b5fd', hi: '#ede9fe' },
    'feature-slate': { bg: '#334155', fg: '#cbd5e1', hi: '#f1f5f9' },
  }
  const c = palettes[tone] ?? palettes['feature-blue']
  return (
    <span className={`landing-feature-icon ${tone}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" width="24" height="24">
        <defs>
          <linearGradient id={`grad-${tone}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={c.fg} />
            <stop offset="100%" stopColor={c.bg} />
          </linearGradient>
        </defs>
        <rect x="6" y="6" width="36" height="36" rx="10" fill={`url(#grad-${tone})`} />
        <rect x="12" y="12" width="14" height="6" rx="3" fill="#ffffff" opacity="0.9" />
        <rect x="12" y="22" width="24" height="4" rx="2" fill="#ffffff" opacity="0.6" />
        <rect x="12" y="30" width="18" height="4" rx="2" fill="#ffffff" opacity="0.4" />
        <circle cx="34" cy="14" r="3" fill={c.hi} />
      </svg>
    </span>
  )
}

/* ============================================================
   FAQ — données
   ============================================================ */
const faqs = [
  {
    q: 'Quels canaux sont pris en charge ?',
    a: 'Anntel Marketing centralise vos campagnes e-mail, WhatsApp et SMS dans un seul espace. Vous préparez vos contenus, ciblez vos contacts et suivez les résultats, sans jongler entre plusieurs outils.',
  },
  {
    q: 'Puis-je gérer les accès de mon équipe ?',
    a: 'Oui. L’administrateur accorde ou retire, pour chaque membre, l’accès à chaque module (campagnes, bot WhatsApp, envoi e-mail, envoi SMS…). Chaque utilisateur ne voit que les pages auxquelles il a droit.',
  },
  {
    q: 'Est-ce que mes données sont en sécurité ?',
    a: 'Vos données restent sur votre appareil pendant la phase de prévisualisation. Une fois la plateforme déployée, elles seront stockées sur une base sécurisée avec chiffrement et sauvegardes régulières.',
  },
  {
    q: 'Puis-je importer mes campagnes existantes ?',
    a: 'Oui. Vous pouvez importer vos campagnes en masse depuis un fichier CSV ou XLSX. Un modèle téléchargeable est disponible pour vous guider dans la mise en forme.',
  },
  {
    q: 'Combien de personnes peuvent utiliser la plateforme ?',
    a: 'Il n’y a pas de limite imposée par défaut. Chaque membre dispose de son propre espace de travail et de ses permissions, adaptées à son rôle dans l’équipe.',
  },
  {
    q: 'Est-ce que je peux essayer sans m’engager ?',
    a: 'Oui. Vous pouvez explorer l’espace de travail en mode aperçu, sans inscription. Lorsque vous êtes prêt, créez un compte pour activer vos propres campagnes.',
  },
]

/* ============================================================
   Témoignages
   ============================================================ */
const testimonials = [
  {
    name: 'Sarah Bennani',
    role: 'Responsable Marketing · Retail',
    text: 'Nous avons centralisé nos campagnes e-mail et SMS en une journée. L’équipe ne perd plus de temps à jongler entre les outils.',
    initial: 'S',
    tone: 'avatar-blue',
  },
  {
    name: 'Karim El Fassi',
    role: 'Growth Lead · E-commerce',
    text: 'Les permissions par rôle sont un vrai gain. Chaque membre ne voit que ce dont il a besoin pour avancer.',
    initial: 'K',
    tone: 'avatar-teal',
  },
  {
    name: 'Leïla Moreau',
    role: 'Directrice de clientèle · Agence',
    text: 'L’interface est claire, rapide et bien pensée. Nos campagnes WhatsApp sont enfin suivies sérieusement.',
    initial: 'L',
    tone: 'avatar-amber',
  },
]

/* ============================================================
   Sous-composants
   ============================================================ */
function Brand() {
  return (
    <span className="landing-brand">
      <span className="landing-brand-symbol" aria-hidden="true"><i /><i /></span>
      <span className="landing-brand-name">anntel<span>marketing</span></span>
    </span>
  )
}

const features = [
  {
    title: 'Campagnes centralisées',
    description: 'Gardez vos campagnes e-mail, WhatsApp et SMS organisées dans un seul espace.',
    tone: 'feature-teal',
    icon: BarChart3,
  },
  {
    title: 'E-mail marketing',
    description: 'Préparez vos contenus, gérez vos audiences et suivez les résultats.',
    tone: 'feature-blue',
    icon: Mail,
  },
  {
    title: 'WhatsApp',
    description: 'Planifiez vos communications et centralisez les réponses de vos contacts.',
    tone: 'feature-green',
    icon: MessageCircle,
  },
  {
    title: 'SMS',
    description: 'Préparez des messages concis et suivez leur statut de livraison.',
    tone: 'feature-amber',
    icon: Smartphone,
  },
  {
    title: 'Suivi des performances',
    description: 'Retrouvez les indicateurs utiles pour comprendre vos campagnes.',
    tone: 'feature-lilac',
    icon: TrendingUp,
  },
  {
    title: 'Espace d’équipe',
    description: 'Donnez à chaque membre un espace de travail adapté à son rôle.',
    tone: 'feature-slate',
    icon: UsersRound,
  },
]

const steps = [
  {
    n: '01',
    title: 'Créez votre compte',
    text: 'Quelques champs suffisent pour ouvrir votre espace de travail Anntel Marketing.',
    icon: UsersRound,
  },
  {
    n: '02',
    title: 'Invitez votre équipe',
    text: 'Ajoutez des membres et attribuez à chacun les pages auxquelles il doit accéder.',
    icon: ContactRound,
  },
  {
    n: '03',
    title: 'Pilotez vos campagnes',
    text: 'Préparez, importez, envoyez et suivez vos campagnes e-mail, WhatsApp et SMS.',
    icon: BarChart3,
  },
]

/* ============================================================
   Page
   ============================================================ */
export function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  return (
    <div className="landing-shell">
      {/* Header */}
      <header className="landing-header">
        <Link className="landing-brand-link" href="/" aria-label="Anntel Marketing, accueil">
          <Brand />
        </Link>
        <nav aria-label="Navigation du site" className="landing-nav">
          <a href="#fonctionnalites">Fonctionnalités</a>
          <a href="#comment-ca-marche">Comment ça marche</a>
          <a href="#temoignages">Témoignages</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="landing-auth-actions">
          <div className="landing-auth-buttons">
            <Link className="landing-auth-login" href="/login">Se connecter</Link>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="landing-hero" id="accueil">
          <div className="landing-hero-copy">
            <span className="landing-eyebrow">
              <i /> PLATEFORME DE MARKETING MULTICANAL
            </span>
            <h1>
              Votre marketing d’équipe, <span>plus clair.</span>
            </h1>
            <p className="landing-hero-description">
              Organisez vos campagnes e-mail, WhatsApp et SMS, gérez vos contacts et
              votre équipe au même endroit. Une base de travail pensée pour la clarté.
            </p>
            <div className="landing-hero-actions">
              <Link className="landing-primary-link" href="/register">
                Démarrer gratuitement <ArrowRight aria-hidden="true" />
              </Link>
              <Link className="landing-secondary-link" href="/workspace">
                Explorer l’aperçu
              </Link>
            </div>
            <div className="landing-hero-stats">
              <div><strong>3</strong><span>canaux unifiés</span></div>
              <div className="landing-hero-stats-divider" />
              <div><strong>100%</strong><span>web · sans installation</span></div>
              <div className="landing-hero-stats-divider" />
              <div><strong>∞</strong><span>campagnes gérées</span></div>
            </div>
            <div className="landing-trust-note">
              <ShieldCheck aria-hidden="true" />
              <span>Vos données restent privées. Aucun envoi réel en mode aperçu.</span>
            </div>
          </div>
          <div className="landing-hero-visual">
            <HeroIllustration />
          </div>
        </section>

        {/* LOGOS / SOCIAL PROOF */}
        <section className="landing-logos" aria-label="Ils nous font confiance">
          <span className="landing-logos-label">UTILISÉ PAR DES ÉQUIPES DANS</span>
          <div className="landing-logos-row">
            <span>Retail &amp; E-commerce</span>
            <span>Agences &amp; Studio</span>
            <span>Services B2B</span>
            <span>Éducation</span>
            <span>Immobilier</span>
            <span>Hôtellerie</span>
          </div>
        </section>

        {/* FEATURES */}
        <section aria-labelledby="features-heading" className="landing-features" id="fonctionnalites">
          <div className="landing-section-heading">
            <div>
              <span className="landing-section-eyebrow">UN ESPACE, TOUS VOS CANAUX</span>
              <h2 id="features-heading">Les bons outils pour avancer ensemble.</h2>
            </div>
            <p>
              Une vue organisée pour préparer, gérer et suivre les communications de votre équipe.
            </p>
          </div>

          <div className="landing-feature-grid">
            {features.map(({ title, description, tone, icon: Icon }) => (
              <article className="landing-feature-card" key={title}>
                <Feature3DIcon tone={tone} />
                <h3>{title}</h3>
                <p>{description}</p>
                <span className="landing-feature-link">
                  En savoir plus <ArrowRight aria-hidden="true" />
                </span>
              </article>
            ))}
          </div>
        </section>

        {/* COMMENT ÇA MARCHE */}
        <section className="landing-steps" id="comment-ca-marche" aria-labelledby="steps-heading">
          <div className="landing-section-heading landing-section-heading-center">
            <div>
              <span className="landing-section-eyebrow">EN TROIS ÉTAPES</span>
              <h2 id="steps-heading">Votre équipe opérationnelle en quelques minutes.</h2>
            </div>
            <p>Un parcours simple, du premier compte à votre première campagne multicanal.</p>
          </div>

          <div className="landing-steps-grid">
            {steps.map(({ n, title, text, icon: Icon }) => (
              <article key={n} className="landing-step-card">
                <div className="landing-step-top">
                  <span className="landing-step-number">{n}</span>
                  <span className="landing-step-icon" aria-hidden="true">
                    <Icon />
                  </span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>

          <div className="landing-steps-cta">
            <span className="landing-steps-cta-icon" aria-hidden="true"><Sparkles /></span>
            <div>
              <strong>Prêt à tester ?</strong>
              <span>Créez un compte gratuit et explorez toutes les fonctionnalités.</span>
            </div>
            <Link className="landing-primary-link" href="/login">
              Se connecter <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </section>

        {/* TÉMOIGNAGES */}
        <section className="landing-testimonials" id="temoignages" aria-labelledby="testimonials-heading">
          <div className="landing-section-heading landing-section-heading-center">
            <div>
              <span className="landing-section-eyebrow">ILS UTILISENT ANNTEL</span>
              <h2 id="testimonials-heading">Des équipes marketing qui gagnent en clarté.</h2>
            </div>
          </div>

          <div className="landing-testimonial-grid">
            {testimonials.map((t) => (
              <article key={t.name} className="landing-testimonial-card">
                <div className="landing-testimonial-stars" aria-label="5 étoiles sur 5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} aria-hidden="true" />
                  ))}
                </div>
                <p className="landing-testimonial-text">“{t.text}”</p>
                <div className="landing-testimonial-author">
                  <span className={`landing-testimonial-avatar ${t.tone}`} aria-hidden="true">
                    {t.initial}
                  </span>
                  <div>
                    <strong>{t.name}</strong>
                    <span>{t.role}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* PANEL ÉQUIPE */}
        <section aria-labelledby="team-heading" className="landing-team-panel" id="equipe">
          <div className="landing-team-mark" aria-hidden="true">
            <ContactRound />
          </div>
          <div>
            <span className="landing-section-eyebrow">CONÇU POUR LES ÉQUIPES</span>
            <h2 id="team-heading">Une organisation claire, sans perdre de vue l’essentiel.</h2>
            <p>
              Un espace par rôle, des campagnes mieux suivies et une vision partagée de
              l’activité marketing.
            </p>
          </div>
          <Link className="landing-team-link" href="/workspace">
            Voir l’aperçu <ArrowRight aria-hidden="true" />
          </Link>
        </section>

        {/* FAQ */}
        <section className="landing-faq" id="faq" aria-labelledby="faq-heading">
          <div className="landing-faq-intro">
            <span className="landing-section-eyebrow">QUESTIONS FRÉQUENTES</span>
            <h2 id="faq-heading">Vous avez une question ? Nous avons la réponse.</h2>
            <p>
              Retrouvez les informations essentielles sur la plateforme, les permissions,
              l’import de données et la sécurité.
            </p>
            <Link className="landing-faq-contact" href="/register">
              <MessageCircle aria-hidden="true" />
              <span>Contacter l’équipe</span>
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>

          <div className="landing-faq-list">
            {faqs.map((item, i) => {
              const open = openFaq === i
              return (
                <div key={item.q} className={`landing-faq-item${open ? ' is-open' : ''}`}>
                  <button
                    type="button"
                    className="landing-faq-question"
                    aria-expanded={open}
                    onClick={() => setOpenFaq(open ? null : i)}
                  >
                    <span>{item.q}</span>
                    <ChevronDown aria-hidden="true" />
                  </button>
                  <div className="landing-faq-answer" hidden={!open}>
                    <p>{item.a}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="landing-final-cta">
          <div className="landing-final-cta-glow" aria-hidden="true" />
          <div className="landing-final-cta-content">
            <span className="landing-eyebrow landing-eyebrow-onDark">
              <i /> PRÊT À DÉMARRER ?
            </span>
            <h2>Donnez à votre équipe un marketing plus clair.</h2>
            <p>
              Créez votre espace Anntel Marketing en moins d’une minute et centralisez
              vos campagnes e-mail, WhatsApp et SMS dès aujourd’hui.
            </p>
            <div className="landing-final-cta-actions">
              <Link className="landing-primary-link landing-primary-link-onDark" href="/register">
                Créer mon compte gratuit <ArrowRight aria-hidden="true" />
              </Link>
              <Link className="landing-secondary-link-onDark" href="/workspace">
                Explorer l’aperçu
              </Link>
            </div>
            <div className="landing-final-cta-points">
              <span><CheckCircle2 aria-hidden="true" /> Sans carte bancaire</span>
              <span><CheckCircle2 aria-hidden="true" /> Sans installation</span>
              <span><CheckCircle2 aria-hidden="true" /> Données privées</span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="landing-footer landing-footer-rich">
        <div className="landing-footer-grid">
          <div className="landing-footer-brand">
            <Link className="landing-brand-link" href="/" aria-label="Anntel Marketing, accueil">
              <Brand />
            </Link>
            <p>
              Plateforme de marketing multicanal conçue pour les équipes qui veulent
              garder une vision claire de leurs campagnes.
            </p>
          </div>

          <div className="landing-footer-col">
            <strong>Produit</strong>
            <a href="#fonctionnalites">Fonctionnalités</a>
            <a href="#comment-ca-marche">Comment ça marche</a>
            <a href="#temoignages">Témoignages</a>
            <a href="#faq">FAQ</a>
          </div>

          <div className="landing-footer-col">
            <strong>Ressources</strong>
            <a href="#faq">Centre d’aide</a>
            <a href="/login">Se connecter</a>
            <a href="/register">Créer un compte</a>
          </div>

          <div className="landing-footer-col">
            <strong>Entreprise</strong>
            <a href="#">À propos</a>
            <a href="#">Confidentialité</a>
            <a href="#">Conditions</a>
            <a href="#">Contact</a>
          </div>
        </div>

        <div className="landing-footer-bottom">
          <span>© 2026 Anntel Marketing. Tous droits réservés.</span>
          <span className="landing-footer-status"><i /> Environnement de prévisualisation</span>
        </div>
      </footer>
    </div>
  )
}