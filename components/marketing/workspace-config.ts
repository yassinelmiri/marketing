import {
  BarChart3,
  LayoutDashboard,
  Mail,
  MessageCircle,
  Settings,
  ShieldCheck,
  Smartphone,
  Users,
  UsersRound,
  ListTodo,
  Search,
} from 'lucide-react'

import type { ViewKey } from '@/lib/permissions'

type NavigationItem = {
  key: ViewKey | 'listes'
  label: string
  icon: typeof LayoutDashboard
  adminOnly?: boolean
}

export const NAV_ITEMS: NavigationItem[] = [
  { key: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { key: 'campagnes', label: 'Campagnes', icon: BarChart3 },
  { key: 'prospection', label: 'Prospection', icon: Search },
  { key: 'listes', label: 'Listes & contacts', icon: Users },
  { key: 'equipe', label: 'Équipe', icon: UsersRound },
  { key: 'tasks', label: 'Gestion des tâches', icon: ListTodo },
  { key: 'whatsapp', label: 'Campagnes WhatsApp', icon: MessageCircle },
  { key: 'email', label: 'E-mail', icon: Mail },
  { key: 'sms', label: 'SMS', icon: Smartphone },
  { key: 'admin-users', label: 'Administration', icon: ShieldCheck, adminOnly: true },
  { key: 'settings', label: 'Paramètres', icon: Settings },
]

export const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Tableau de bord',
    subtitle: 'Retrouvez en un coup d’œil vos campagnes, vos contacts et l’activité de votre équipe.',
  },
  prospection: {
    title: 'Prospection',
    subtitle: 'Recherchez des prospects, créez des listes ciblées et suivez vos actions de contact.',
  },
  campagnes: {
    title: 'Campagnes',
    subtitle: 'Créez vos campagnes, associez vos listes de contacts et suivez leur avancement.',
  },
  listes: {
    title: 'Listes & contacts',
    subtitle: 'Ajoutez des contacts, classez-les dans des listes et retrouvez facilement leurs informations.',
  },
  equipe: {
    title: 'Équipe',
    subtitle: 'Consultez les membres de l’équipe et identifiez clairement leur rôle.',
  },
  tasks: {
    title: 'Gestion des tâches',
    subtitle: 'Créez des tâches, attribuez un responsable et suivez chaque étape jusqu’à la réalisation.',
  },
  whatsapp: {
    title: 'Campagnes WhatsApp',
    subtitle: 'Importez vos contacts, préparez vos messages et suivez les envois manuels via WhatsApp Web.',
  },
  email: {
    title: 'Envoi e-mail',
    subtitle: 'Configurez vos expéditeurs, choisissez une liste et consultez l’historique des envois.',
  },
  sms: {
    title: 'Envoi SMS',
    subtitle: 'Accédez à l’espace de préparation et de gestion des campagnes SMS.',
  },
  'admin-users': {
    title: 'Administration',
    subtitle: 'Gérez les comptes utilisateurs, attribuez les rôles et contrôlez les accès à chaque module.',
  },
  settings: {
    title: 'Paramètres',
    subtitle: 'Mettez à jour votre profil et modifiez votre mot de passe en toute sécurité.',
  },
}

