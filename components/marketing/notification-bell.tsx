'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bell, CheckCheck, ClipboardList, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type NotificationItem = {
  id: number
  type: string
  title: string
  body: string
  task_id: number | null
  is_read: boolean
  created_at: string
}

export function NotificationBell({ userId }: { userId: number }) {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<NotificationItem[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const unread = items.filter((item) => !item.is_read).length

  async function load() {
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' })
      const data = await response.json()
      if (response.ok) setItems((data.notifications ?? []).filter((item: NotificationItem) => !item.type?.includes('chat')))
    } catch {
      // Notifications remain non-blocking if the endpoint is temporarily unavailable.
    }
  }

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('global-notifications-' + userId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: 'user_id=eq.' + userId,
      }, () => { void load() })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [supabase, userId])

  async function markRead(id?: number) {
    setBusy(true)
    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? { id } : { all: true }),
      })
      if (response.ok) await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="global-notification">
      <button
        type="button"
        className="global-notification-trigger"
        aria-label={`Notifications, ${unread} non lues`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={19} />
        {unread > 0 && <span className="global-notification-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="global-notification-panel">
          <header>
            <div><strong>Notifications</strong><small>{unread} non lue(s)</small></div>
            <div className="global-notification-actions">
              <button type="button" onClick={() => void markRead()} disabled={!unread || busy} title="Tout marquer comme lu"><CheckCheck size={16} /></button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer"><X size={16} /></button>
            </div>
          </header>
          <div className="global-notification-list">
            {items.length === 0 ? (
              <p className="global-notification-empty">Vous êtes à jour. Aucune notification.</p>
            ) : items.map((item) => (
              <button
                type="button"
                key={item.id}
                className={'global-notification-item ' + (item.is_read ? '' : 'unread')}
                onClick={() => !item.is_read && void markRead(item.id)}
              >
                <span className="global-notification-item-icon">
                  <ClipboardList size={16} />
                </span>
                <span className="global-notification-item-copy">
                  <strong>{item.title}</strong>
                  <span>{item.body}</span>
                  <small>{new Date(item.created_at).toLocaleString('fr-FR')}</small>
                </span>
                {!item.is_read && <i />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
