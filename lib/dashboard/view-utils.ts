export type DashboardModuleStats = {
  email: { campaigns: number; sent: number; failed: number; opened: number; clicked: number; running: number; todaySent: number; yesterdaySent: number; loaded: boolean }
  whatsapp: { campaigns: number; recipients: number; sent: number; failed: number; running: number; todaySent: number; yesterdaySent: number; loaded: boolean }
  tasks: { total: number; open: number; done: number; late: number; loaded: boolean }
}

type ApiRecord = Record<string, any>

export function createEmptyDashboardModuleStats(): DashboardModuleStats {
  return {
    email: { campaigns: 0, sent: 0, failed: 0, opened: 0, clicked: 0, running: 0, todaySent: 0, yesterdaySent: 0, loaded: false },
    whatsapp: { campaigns: 0, recipients: 0, sent: 0, failed: 0, running: 0, todaySent: 0, yesterdaySent: 0, loaded: false },
    tasks: { total: 0, open: 0, done: 0, late: 0, loaded: false },
  }
}

const sum = (items: ApiRecord[], select: (item: ApiRecord) => unknown) =>
  items.reduce((total, item) => total + Number(select(item) || 0), 0)

export function buildDashboardModuleStats(data: {
  email: { campaigns?: ApiRecord[]; daily_stats?: { today_sent?: number; yesterday_sent?: number } } | null
  whatsapp: { campaigns?: ApiRecord[]; daily_stats?: { today_sent?: number; yesterday_sent?: number } } | null
  tasks: { tasks?: ApiRecord[] } | null
}, now = Date.now()): DashboardModuleStats {
  const emailCampaigns = data.email?.campaigns ?? []
  const whatsappCampaigns = data.whatsapp?.campaigns ?? []
  const tasks = data.tasks?.tasks ?? []

  return {
    email: {
      campaigns: emailCampaigns.length,
      sent: sum(emailCampaigns, (item) => item.sent_count),
      failed: sum(emailCampaigns, (item) => item.failed_count),
      opened: sum(emailCampaigns, (item) => item.open_count),
      clicked: sum(emailCampaigns, (item) => item.click_count),
      running: emailCampaigns.filter((item) => ['sending', 'processing', 'running'].includes(String(item.status))).length,
      todaySent: Number(data.email?.daily_stats?.today_sent ?? 0),
      yesterdaySent: Number(data.email?.daily_stats?.yesterday_sent ?? 0),
      loaded: Boolean(data.email),
    },
    whatsapp: {
      campaigns: whatsappCampaigns.length,
      recipients: sum(whatsappCampaigns, (item) => item.total_recipients),
      sent: sum(whatsappCampaigns, (item) => item.counts?.sent),
      failed: sum(whatsappCampaigns, (item) => item.counts?.failed),
      running: whatsappCampaigns.filter((item) => item.status === 'in_progress').length,
      todaySent: Number(data.whatsapp?.daily_stats?.today_sent ?? 0),
      yesterdaySent: Number(data.whatsapp?.daily_stats?.yesterday_sent ?? 0),
      loaded: Boolean(data.whatsapp),
    },
    tasks: {
      total: tasks.length,
      open: tasks.filter((item) => item.status !== 'done').length,
      done: tasks.filter((item) => item.status === 'done').length,
      late: tasks.filter((item) => {
        if (item.status === 'done' || !item.due_date) return false
        const dueAt = new Date(String(item.due_date) + 'T23:59:59').getTime()
        return Number.isFinite(dueAt) && dueAt < now
      }).length,
      loaded: Boolean(data.tasks),
    },
  }
}


import type { Campagne } from '@/lib/storage'

export type CampaignDiagnostic = {
  total: number
  active: number
  completed: number
  drafts: number
  archived: number
  completionRate: number
  activeRate: number
  recentCampaigns: number
  health: number
  findings: { tone: 'good' | 'warn' | 'info'; title: string; detail: string }[]
}

export function buildCampaignDiagnostic(
  campaigns: readonly Pick<Campagne, 'status' | 'date_modification'>[],
  commentsCount: number,
  contactsCount: number,
  listsCount: number,
  now = Date.now(),
): CampaignDiagnostic {
  const total = campaigns.length
  let active = 0
  let completed = 0
  let drafts = 0
  let archived = 0
  let recentCampaigns = 0

  for (const campaign of campaigns) {
    if (campaign.status === 'en_cours') active += 1
    else if (campaign.status === 'terminee') completed += 1
    else if (campaign.status === 'brouillon') drafts += 1
    else if (campaign.status === 'archivee') archived += 1

    const modifiedAt = new Date(campaign.date_modification).getTime()
    if (Number.isFinite(modifiedAt) && now - modifiedAt <= 30 * 24 * 60 * 60 * 1000) recentCampaigns += 1
  }

  const completionRate = total ? Math.round((completed / total) * 100) : 0
  const activeRate = total ? Math.round((active / total) * 100) : 0
  const health = total === 0 ? 0 : Math.min(100, Math.round(
    (completionRate * 0.45)
    + (Math.min(recentCampaigns / total, 1) * 25)
    + (Math.min(commentsCount / total, 1) * 15)
    + (Math.min(contactsCount / Math.max(listsCount, 1) / 10, 1) * 15),
  ))
  const findings: CampaignDiagnostic['findings'] = []

  if (!total) findings.push({ tone: 'info', title: 'Démarrage du projet', detail: 'Aucune campagne encore créée. Créez une campagne pour commencer à suivre les performances.' })
  else if (drafts > active + completed) findings.push({ tone: 'warn', title: 'Beaucoup de campagnes en préparation', detail: `${drafts} brouillon(s) : pensez à les planifier ou à les lancer.` })
  else findings.push({ tone: 'good', title: 'Pipeline de campagnes', detail: `${active} campagne(s) en cours et ${completed} terminée(s) sur ${total} au total.` })

  if (contactsCount === 0) findings.push({ tone: 'warn', title: 'Base de contacts vide', detail: 'Importez ou ajoutez des contacts pour alimenter les campagnes.' })
  else if (listsCount === 0) findings.push({ tone: 'warn', title: 'Aucune liste de contacts', detail: 'Créez des listes pour segmenter la base et associer les contacts aux campagnes.' })
  else findings.push({ tone: 'good', title: 'Base de données marketing', detail: `${contactsCount.toLocaleString('fr-FR')} contact(s) répartis sur ${listsCount} liste(s).` })

  if (commentsCount === 0 && total > 0) findings.push({ tone: 'info', title: 'Collaboration à renforcer', detail: 'Aucun commentaire : utilisez les commentaires de campagne pour centraliser les échanges.' })
  else if (commentsCount > 0) findings.push({ tone: 'good', title: 'Suivi collaboratif', detail: `${commentsCount} commentaire(s) pour garder le contexte et les décisions.` })

  return { total, active, completed, drafts, archived, completionRate, activeRate, recentCampaigns, health, findings }
}
