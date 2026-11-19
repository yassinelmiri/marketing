'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  kind: ToastKind
  title: string
  message?: string
  duration?: number
}

interface ToastContextValue {
  show: (toast: Omit<ToastItem, 'id'>) => void
  success: (title: string, message?: string) => void
  error: (title: string, message?: string) => void
  info: (title: string, message?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let counter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      counter += 1
      const id = counter
      const item: ToastItem = {
        id,
        duration: toast.duration ?? 4000,
        ...toast,
      }
      setToasts((prev) => [...prev, item])
      const duration = item.duration ?? 4000
      if (duration > 0) {
        setTimeout(() => remove(id), duration)
      }
    },
    [remove],
  )

  const success = useCallback(
    (title: string, message?: string) => show({ kind: 'success', title, message }),
    [show],
  )
  const error = useCallback(
    (title: string, message?: string) => show({ kind: 'error', title, message, duration: 6000 }),
    [show],
  )
  const info = useCallback(
    (title: string, message?: string) => show({ kind: 'info', title, message }),
    [show],
  )

  return (
    <ToastContext.Provider value={{ show, success, error, info }}>
      {children}
      <ToastViewport toasts={toasts} onClose={remove} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast doit être utilisé à l’intérieur de <ToastProvider>')
  }
  return ctx
}

function ToastViewport({
  toasts,
  onClose,
}: {
  toasts: ToastItem[]
  onClose: (id: number) => void
}) {
  // Empêche le SSR hydration mismatch
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  return (
    <div className="toast-viewport" role="region" aria-label="Notifications">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onClose={() => onClose(t.id)} />
      ))}
    </div>
  )
}

function ToastCard({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  const Icon =
    toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertCircle : Info

  return (
    <div className={`toast toast-${toast.kind}`} role="status" aria-live="polite">
      <span className="toast-icon" aria-hidden="true">
        <Icon />
      </span>
      <div className="toast-content">
        <strong>{toast.title}</strong>
        {toast.message && <p>{toast.message}</p>}
      </div>
      <button
        type="button"
        className="toast-close"
        onClick={onClose}
        aria-label="Fermer la notification"
      >
        <X />
      </button>
    </div>
  )
}