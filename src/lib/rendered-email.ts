import type { EmailMessage } from './firebase'

type MessageFileNameOptions = {
  message: EmailMessage
  formatPushTime: (id: string) => string
  formatRecipients: (recipients: unknown) => string
  extension: string
}

type RenderedEmailDownloadOptions = {
  html: string
  text: string
  message: EmailMessage
  formatPushTime: (id: string) => string
  formatRecipients: (recipients: unknown) => string
}

type MessageTextDownloadOptions = {
  content: string
  message: EmailMessage
  formatPushTime: (id: string) => string
  formatRecipients: (recipients: unknown) => string
  extension: 'data.txt' | 'transcript.txt'
}

export function getRenderedEmailDocument(html: string, text: string) {
  const body = html || `<pre>${escapeHtml(text)}</pre>`

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { margin: 0; min-height: 100%; background: #fff; color: #172033; }
      body { box-sizing: border-box; padding: 24px; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      img, table, iframe { max-width: 100%; }
      img { height: auto; }
      pre { white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    </style>
  </head>
  <body>${body}</body>
</html>`
}

export function downloadRenderedEmailHtml({
  html,
  text,
  message,
  formatPushTime,
  formatRecipients,
}: RenderedEmailDownloadOptions) {
  const document = getRenderedEmailDocument(html, text)
  downloadBlob(
    document,
    'text/html;charset=utf-8',
    getMessageFileName({ message, formatPushTime, formatRecipients, extension: 'html' }),
  )
}

export function downloadMessageText({
  content,
  message,
  formatPushTime,
  formatRecipients,
  extension,
}: MessageTextDownloadOptions) {
  downloadBlob(
    content,
    'text/plain;charset=utf-8',
    getMessageFileName({ message, formatPushTime, formatRecipients, extension }),
  )
}

function downloadBlob(content: string, type: string, fileName: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function getMessageFileName({
  message,
  formatPushTime,
  formatRecipients,
  extension,
}: MessageFileNameOptions) {
  const from = message.from ?? 'unknown-sender'
  const to = formatRecipients(message.recipients)
  const receivedAt = message.received_at ?? formatPushTime(message.id)

  return `${sanitizeFilePart(from)}-${sanitizeFilePart(to)}-${sanitizeFilePart(receivedAt)}.${extension}`
}

function sanitizeFilePart(value: string) {
  return (
    value
      .trim()
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'unknown'
  )
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
