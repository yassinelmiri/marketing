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
