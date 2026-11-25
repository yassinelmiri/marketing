import { NextResponse, type NextRequest } from 'next/server'
import nodemailer from 'nodemailer'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptSmtpPassword } from '@/lib/supabase/smtp-crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60


function getPublicOrigin(request: NextRequest) {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
  const vercelHost = process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : ''
  const candidate = (configured || vercelHost || request.nextUrl.origin).replace(/\/+$/, '')
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.origin
  } catch {}
  return request.nextUrl.origin
}

type Campaign = {
  id: number; smtp_account_id: number; smtp_account_ids?: number[]; sender_email: string; sender_name: string | null
  subject: string; message: string; reply_to: string | null; recipients: string[]
  recipient_offset: number; batch_size: number; batch_delay_seconds: number
  sent_count: number; failed_count: number; failed_recipients: string[]
  tracking_opens: boolean; tracking_clicks: boolean
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== 'Bearer ' + secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const publicOrigin = getPublicOrigin(request)
  const now = new Date()
  const staleLock = new Date(now.getTime() - 2 * 60 * 1000).toISOString()
  const { data: due, error: dueError } = await admin.from('email_campaigns')
    .select('id')
    .in('status', ['pending', 'scheduled', 'sending'])
    .lte('next_batch_at', now.toISOString())
    .or('worker_locked_at.is.null,worker_locked_at.lt.' + staleLock)
    .order('next_batch_at', { ascending: true })
    .limit(3)

  if (dueError) return NextResponse.json({ error: 'Queue unavailable.' }, { status: 500 })
  const processed: Array<{ id: number; sent: number; failed: number; status: string }> = []

  await Promise.all((due ?? []).map(async (row) => {
    const lockAt = new Date().toISOString()
    const { data: claimed, error: claimError } = await admin.from('email_campaigns')
      .update({ worker_locked_at: lockAt, status: 'sending', started_at: lockAt, updated_at: lockAt })
      .eq('id', row.id)
      .in('status', ['pending', 'scheduled', 'sending'])
      .or('worker_locked_at.is.null,worker_locked_at.lt.' + staleLock)
      .select('id,smtp_account_id,smtp_account_ids,sender_email,sender_name,subject,message,reply_to,recipients,recipient_offset,batch_size,batch_delay_seconds,sent_count,failed_count,failed_recipients,tracking_opens,tracking_clicks')
      .maybeSingle()
    if (claimError || !claimed) return

    const campaign = claimed as Campaign
    const transporters = new Map<number, ReturnType<typeof nodemailer.createTransport>>()
    const senderAccounts = new Map<number, { email: string; name: string | null }>()
    try {
      const smtpIds = Array.from(new Set((Array.isArray(campaign.smtp_account_ids) && campaign.smtp_account_ids.length ? campaign.smtp_account_ids : [campaign.smtp_account_id]).map(Number).filter(id => Number.isSafeInteger(id) && id > 0)))
      if (!smtpIds.length) throw new Error('No SMTP sender configured')
      const { data: smtpRows, error: smtpError } = await admin.from('smtp_accounts')
        .select('id,name,email,from_name,host,port,secure,username,password_encrypted')
        .in('id', smtpIds).eq('is_active', true)
      if (smtpError || (smtpRows ?? []).length !== smtpIds.length) throw new Error('One or more SMTP accounts are unavailable')
      for (const smtp of smtpRows ?? []) {
        const transporter = nodemailer.createTransport({
          host: smtp.host, port: Number(smtp.port), secure: Boolean(smtp.secure),
          auth: { user: smtp.username, pass: decryptSmtpPassword(smtp.password_encrypted) },
          connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 25000,
        })
        await transporter.verify()
        transporters.set(Number(smtp.id), transporter)
        senderAccounts.set(Number(smtp.id), { email: smtp.email, name: smtp.from_name || smtp.name })
      }

      const recipients = Array.isArray(campaign.recipients) ? campaign.recipients : []
      const start = Math.max(0, Number(campaign.recipient_offset) || 0)
      const batchSize = Math.max(1, Number(campaign.batch_size) || 25)
      let offset = start
      let sent = Number(campaign.sent_count) || 0
      let failed = Number(campaign.failed_count) || 0
      const failedRecipients = Array.isArray(campaign.failed_recipients) ? [...campaign.failed_recipients] : []
      const deadline = Date.now() + 44000

      const sendConcurrency = Math.min(10, Math.max(1, Number(process.env.EMAIL_WORKER_CONCURRENCY) || 5))
      while (offset < recipients.length && Date.now() < deadline) {
        const batchEnd = Math.min(recipients.length, offset + batchSize)
        let shouldStop = false
        while (offset < batchEnd && Date.now() < deadline) {
          const chunkStart = offset
          const chunk = recipients.slice(chunkStart, Math.min(batchEnd, chunkStart + sendConcurrency))
          const results = await Promise.all(chunk.map(async (rawRecipient, chunkIndex) => {
            const recipient = String(rawRecipient ?? '').trim().toLowerCase()
            if (!recipient) return { sent: false, failed: false, recipient }
            try {
              const pixel = campaign.tracking_opens
                ? '<img src="' + publicOrigin + '/api/email/track/open?campaign=' + campaign.id + '&email=' + encodeURIComponent(recipient) + '" width="1" height="1" alt="" style="display:none" />'
                : ''
              const { data: token, error: tokenError } = await admin.from('email_unsubscribe_tokens')
                .upsert({ email: recipient, campaign_id: campaign.id }, { onConflict: 'email,campaign_id' }).select('token').single()
              if (tokenError || !token) throw new Error('Unsubscribe token unavailable')
              const unsubscribeLink = publicOrigin + '/api/email/unsubscribe/' + token.token
              let html = /<[a-z][\s\S]*?>/i.test(campaign.message)
                ? campaign.message
                : campaign.message.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] ?? ch)).replace(/\n/g, '<br>')
              if (campaign.tracking_clicks) {
                html = html.replace(/href=["'](https?:\/\/[^"']+)["']/gi, (_match, url) =>
                  'href="' + publicOrigin + '/api/email/track/click?campaign=' + campaign.id + '&email=' + encodeURIComponent(recipient) + '&url=' + encodeURIComponent(url) + '"')
              }
              const senderId = smtpIds[(chunkStart + chunkIndex) % smtpIds.length]
              const senderTransporter = transporters.get(senderId)
              const sender = senderAccounts.get(senderId)
              if (!senderTransporter || !sender) throw new Error('Selected SMTP sender is unavailable')
              await senderTransporter.sendMail({
                from: { name: sender.name || sender.email, address: sender.email },
                to: recipient, ...(campaign.reply_to ? { replyTo: campaign.reply_to } : {}),
                subject: campaign.subject,
                headers: { 'List-Unsubscribe': '<' + unsubscribeLink + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
                html: '<div>' + html + '</div><p style="font-size:12px;color:#666;margin-top:24px"><a href="' + unsubscribeLink + '">Se désabonner</a></p>' + pixel,
                text: campaign.message.replace(/<[^>]*>/g, ' ') + '\n\nSe désabonner : ' + unsubscribeLink,
              })
              return { sent: true, failed: false, recipient }
            } catch (error) {
              console.error('[email/worker] recipient failed:', campaign.id, recipient, error)
              return { sent: false, failed: true, recipient }
            }
          }))
          for (const result of results) {
            if (result.sent) sent++
            if (result.failed) { failed++; failedRecipients.push(result.recipient) }
          }
          offset += chunk.length
          if (offset < batchEnd && Date.now() >= deadline) shouldStop = true
        }
        if (shouldStop || offset < batchEnd) break
        if (offset < recipients.length && campaign.batch_delay_seconds > 0) {
          const waitMs = campaign.batch_delay_seconds * 1000
          if (Date.now() + waitMs >= deadline) break
          await new Promise((resolve) => setTimeout(resolve, waitMs))
        }
      }

      const { data: liveState } = await admin.from('email_campaigns').select('status').eq('id', campaign.id).maybeSingle()
      const paused = liveState?.status === 'paused'
      const finished = offset >= recipients.length
      const nextAt = paused || finished ? null : new Date(Date.now() + (offset % batchSize === 0 ? campaign.batch_delay_seconds * 1000 : 0)).toISOString()
      const status = paused ? 'paused' : finished ? (failed === 0 ? 'sent' : sent > 0 ? 'partial' : 'failed') : 'sending'
      const { error: updateError } = await admin.from('email_campaigns').update({
        recipient_offset: offset, sent_count: sent, failed_count: failed,
        failed_recipients: failedRecipients, status, next_batch_at: nextAt,
        sent_at: finished ? new Date().toISOString() : null,
        worker_locked_at: null, updated_at: new Date().toISOString(),
      }).eq('id', campaign.id)
      if (updateError) throw updateError
      processed.push({ id: campaign.id, sent, failed, status })
    } catch (error) {
      console.error('[email/worker] campaign failed:', campaign.id, error)
      // A campaign-level failure (SMTP verification, missing sender, etc.) must
      // count every unprocessed recipient as failed so the UI never stays at 0%.
      const recipients = Array.isArray(campaign.recipients) ? campaign.recipients : []
      const offset = Math.max(0, Number(campaign.recipient_offset) || 0)
      const remaining = recipients.slice(offset).map((email) => String(email ?? '').trim().toLowerCase()).filter(Boolean)
      const sent = Number(campaign.sent_count) || 0
      const failed = (Number(campaign.failed_count) || 0) + remaining.length
      const failedRecipients = [...(Array.isArray(campaign.failed_recipients) ? campaign.failed_recipients : []), ...remaining]
      await admin.from('email_campaigns').update({
        recipient_offset: recipients.length,
        sent_count: sent,
        failed_count: failed,
        failed_recipients: failedRecipients,
        status: sent > 0 ? 'partial' : 'failed',
        next_batch_at: null,
        sent_at: new Date().toISOString(),
        worker_locked_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', campaign.id)
      processed.push({ id: campaign.id, sent, failed, status: sent > 0 ? 'partial' : 'failed' })
    } finally {
      for (const transporter of transporters.values()) transporter.close()
    }
  }))

  return NextResponse.json({ success: true, processed })
}
