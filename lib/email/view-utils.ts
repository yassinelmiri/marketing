import type { EmailTemplate } from '@/lib/email/types'

export function normalizeText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value && typeof value === 'object' && 'message' in value) return normalizeText((value as { message?: unknown }).message)
  return ''
}

export function normalizeTemplate(value: unknown): EmailTemplate {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return { id: Number(item.id) || 0, name: normalizeText(item.name), subject: normalizeText(item.subject), html_content: normalizeText(item.html_content), created_at: normalizeText(item.created_at) } as EmailTemplate
}

function escapeTemplateText(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char))
}

export function composeTemplateHtml(templateHtml: string, body: string): string {
  const safeBody = escapeTemplateText(body).replace(/\r?\n/g, '<br/>')
  if (templateHtml.includes('{{message}}')) return templateHtml.split('{{message}}').join(safeBody)
  const contentBlock = '<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:#334155;padding:20px 24px;">' + safeBody + '</div>'
  const closingBody = '</body>'
  const closingIndex = templateHtml.toLowerCase().lastIndexOf(closingBody)
  return closingIndex >= 0 ? templateHtml.slice(0, closingIndex) + contentBlock + templateHtml.slice(closingIndex) : templateHtml + contentBlock
}

export function displayMessage(value:unknown,fallback='Une erreur est survenue'):string{
 if(typeof value==='string')return value
 if(value instanceof Error)return value.message
 if(value&&typeof value==='object'&&'message' in value){const message=(value as {message?:unknown}).message;return typeof message==='string'?message:fallback}
 return fallback
}
export function displayValue(value:unknown,fallback='—'):string{
 if(value===null||value===undefined||value==='')return fallback
 if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')return String(value)
 if(value instanceof Error)return value.message
 if(typeof value==='object'&&'message' in value)return displayValue((value as {message?:unknown}).message,fallback)
 try{return JSON.stringify(value)??fallback}catch{return fallback}
}
