'use client'
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, Server, ShieldAlert, Wifi, XCircle } from 'lucide-react'

type Incident = { id: string; level: 'critical' | 'warning' | 'info'; title: string; detail: string; source: string; time: string }
type ModuleCheck = { name: string; ok: boolean; detail: string }

export function AlertsView() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [checks, setChecks] = useState<ModuleCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const endpoints = [
      { name: 'E-mail', url: '/api/email/send' },
      { name: 'WhatsApp', url: '/api/whatsapp/campaigns' },
      { name: 'Gestion des tâches', url: '/api/tasks' },
    ]
    const results = await Promise.allSettled(endpoints.map(async (endpoint) => {
      const response = await fetch(endpoint.url, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || `Erreur HTTP ${response.status}`)
      return data
    }))
    const nextChecks: ModuleCheck[] = []
    const nextIncidents: Incident[] = []
    results.forEach((result, index) => {
      const endpoint = endpoints[index]
      if (result.status === 'rejected') {
        const detail = result.reason instanceof Error ? result.reason.message : 'Service temporairement indisponible.'
        nextChecks.push({ name: endpoint.name, ok: false, detail })
        nextIncidents.push({ id: `service-${endpoint.name}`, level: 'critical', title: `Service ${endpoint.name} indisponible`, detail, source: endpoint.name, time: new Date().toISOString() })
        return
      }
      nextChecks.push({ name: endpoint.name, ok: true, detail: 'Réponse API reçue.' })
      const payload = result.value
      if (endpoint.name === 'E-mail') {
        const failed = (payload.campaigns ?? []).reduce((sum: number, item: { failed_count?: number }) => sum + Number(item.failed_count || 0), 0)
        if (failed > 0) nextIncidents.push({ id: 'email-failures', level: 'warning', title: 'Échecs d’envoi e-mail détectés', detail: `${failed.toLocaleString('fr-FR')} e-mail(s) en échec dans les campagnes.`, source: 'E-mail', time: new Date().toISOString() })
      }
      if (endpoint.name === 'WhatsApp') {
        const failed = (payload.campaigns ?? []).reduce((sum: number, item: { counts?: { failed?: number } }) => sum + Number(item.counts?.failed || 0), 0)
        if (failed > 0) nextIncidents.push({ id: 'whatsapp-failures', level: 'warning', title: 'Échecs WhatsApp détectés', detail: `${failed.toLocaleString('fr-FR')} destinataire(s) en échec.`, source: 'WhatsApp', time: new Date().toISOString() })
      }
      if (endpoint.name === 'Gestion des tâches') {
        const late = (payload.tasks ?? []).filter((item: { status?: string; due_date?: string | null }) => item.status !== 'done' && item.due_date && new Date(String(item.due_date) + 'T23:59:59').getTime() < Date.now()).length
        if (late > 0) nextIncidents.push({ id: 'late-tasks', level: 'warning', title: 'Tâches en retard', detail: `${late} tâche(s) ont dépassé leur date limite.`, source: 'Gestion des tâches', time: new Date().toISOString() })
      }
    })
    if (nextIncidents.length === 0) nextIncidents.push({ id: 'all-clear', level: 'info', title: 'Aucun incident détecté', detail: 'Les services contrôlés répondent correctement et aucun échec ou retard n’a été signalé.', source: 'Surveillance automatique', time: new Date().toISOString() })
    setChecks(nextChecks)
    setIncidents(nextIncidents)
    setUpdatedAt(new Date())
    setLoading(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  const criticalCount = incidents.filter((item) => item.level === 'critical').length
  const warningCount = incidents.filter((item) => item.level === 'warning').length

  return <section className="workspace-section alerts-page">
    <header className="alerts-heading">
      <div><span className="settings-eyebrow">SUPERVISION & MAINTENANCE</span><h2>Alertes & incidents</h2><p>Surveillance des services, erreurs d’envoi et points opérationnels à traiter.</p></div>
      <button type="button" className="alerts-refresh" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} className={loading ? 'is-spinning' : ''}/> Actualiser</button>
    </header>
    <div className="alerts-summary-grid">
      <article className="alerts-summary-card"><span className="alerts-summary-icon critical"><ShieldAlert size={20}/></span><div><strong>{criticalCount}</strong><span>Incidents critiques</span></div></article>
      <article className="alerts-summary-card"><span className="alerts-summary-icon warning"><AlertTriangle size={20}/></span><div><strong>{warningCount}</strong><span>Alertes à traiter</span></div></article>
      <article className="alerts-summary-card"><span className="alerts-summary-icon healthy"><CheckCircle2 size={20}/></span><div><strong>{checks.filter((item) => item.ok).length}/{checks.length}</strong><span>Services opérationnels</span></div></article>
    </div>
    <section className="alerts-section-card">
      <div className="alerts-section-title"><div><h3>État des services</h3><p>Contrôle en direct des API principales</p></div><span className="alerts-updated"><Clock3 size={14}/>{updatedAt ? updatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'En attente'}</span></div>
      <div className="alerts-service-grid">{checks.map((item) => <article className="alerts-service-item" key={item.name}><span className={item.ok ? 'service-state online' : 'service-state offline'}>{item.ok ? <Wifi size={17}/> : <XCircle size={17}/>}</span><div><strong>{item.name}</strong><span>{item.detail}</span></div><b className={item.ok ? 'service-label online' : 'service-label offline'}>{item.ok ? 'Opérationnel' : 'Incident'}</b></article>)}{loading && checks.length === 0 && <p className="alerts-empty">Vérification des services en cours…</p>}</div>
    </section>
    <section className="alerts-section-card">
      <div className="alerts-section-title"><div><h3>Journal des alertes</h3><p>Incidents détectés lors du dernier contrôle</p></div><span className="alerts-count">{incidents.length} élément(s)</span></div>
      <div className="alerts-incident-list">{incidents.map((item) => <article className={`alerts-incident-item ${item.level}`} key={item.id}><span className="alerts-incident-icon">{item.level === 'critical' ? <XCircle size={19}/> : item.level === 'warning' ? <AlertTriangle size={19}/> : <CheckCircle2 size={19}/>}</span><div className="alerts-incident-copy"><div><strong>{item.title}</strong><span className={`alerts-level ${item.level}`}>{item.level === 'critical' ? 'Critique' : item.level === 'warning' ? 'À surveiller' : 'Information'}</span></div><p>{item.detail}</p><small><Server size={12}/> {item.source} · {new Date(item.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</small></div></article>)}{loading && <p className="alerts-empty">Actualisation des alertes…</p>}</div>
    </section>
    <p className="alerts-disclaimer">Les contrôles sont effectués à l’ouverture de cette page et lors d’une actualisation manuelle. Cette page ne remplace pas une supervision serveur permanente.</p>
  </section>
}
