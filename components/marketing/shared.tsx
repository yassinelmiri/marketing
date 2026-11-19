import type { CampagneStatus } from '@/lib/storage'

export const STATUS_LABELS: Record<CampagneStatus, string> = {
  brouillon: 'Brouillon',
  en_cours: 'En cours',
  terminee: 'Terminée',
  archivee: 'Archivée',
}

export const STATUS_COLORS: Record<CampagneStatus, string> = {
  brouillon: 'status-draft',
  en_cours: 'status-progress',
  terminee: 'status-done',
  archivee: 'status-archived',
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function initials(prenom?: string, nom?: string): string {
  return `${prenom?.charAt(0).toUpperCase() ?? ''}${nom?.charAt(0).toUpperCase() ?? ''}` || '?'
}