<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { EmailMessage } from './firebase'

  // oxlint-disable-next-line no-unassigned-vars
  export let html = ''
  // oxlint-disable-next-line no-unassigned-vars
  export let text = ''
  // oxlint-disable-next-line no-unassigned-vars
  export let message: EmailMessage
  // oxlint-disable-next-line no-unassigned-vars
  export let t: Record<string, string>
  // oxlint-disable-next-line no-unassigned-vars
  export let formatPushTime: (id: string) => string
  // oxlint-disable-next-line no-unassigned-vars
  export let formatRecipients: (recipients: unknown) => string
  // oxlint-disable-next-line no-unassigned-vars
  export let close: () => void

  onDestroy(() => {
    // Keep the close callback one-way; parent owns the visibility state.
  })

  function getRenderedEmailDocument() {
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

  function downloadRenderedEmailHtml() {
    const document = getRenderedEmailDocument()
    const blob = new Blob([document], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = getRenderedEmailFileName()
    link.click()
    URL.revokeObjectURL(url)
  }

  function getRenderedEmailFileName() {
    const from = message.from ?? 'unknown-sender'
    const to = formatRecipients(message.recipients)
    const receivedAt = message.received_at ?? formatPushTime(message.id)

    return `${sanitizeFilePart(from)}-${sanitizeFilePart(to)}-${sanitizeFilePart(receivedAt)}.html`
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
</script>

<svelte:window on:keydown={(event) => event.key === 'Escape' && close()} />

<div class="email-fullscreen-backdrop" role="presentation">
  <div class="email-fullscreen-dialog" role="dialog" aria-modal="true" aria-label={t.renderedEmailFullScreen}>
    <header class="email-fullscreen-header">
      <h2>{t.renderedEmail}</h2>
      <div class="email-fullscreen-actions">
        <a href="#download-email" on:click|preventDefault={downloadRenderedEmailHtml}>{t.downloadHtml}</a>
        <a href="#close-email" on:click|preventDefault={close}>{t.close}</a>
      </div>
    </header>
    <iframe
      class="email-fullscreen-frame"
      title={t.renderedEmailFullScreen}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      srcdoc={getRenderedEmailDocument()}
    ></iframe>
  </div>
</div>

<style>
  .email-fullscreen-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    background: rgba(3, 7, 18, 0.86);
    padding: 18px;
    box-sizing: border-box;
  }

  .email-fullscreen-dialog {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    border: 1px solid rgba(149, 178, 213, 0.2);
    border-radius: 22px;
    background: #0e1a2b;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
    overflow: hidden;
  }

  .email-fullscreen-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid rgba(149, 178, 213, 0.2);
    padding: 14px 16px;
  }

  .email-fullscreen-header h2 {
    margin: 0;
    color: #ffffff;
    font-size: 18px;
  }

  .email-fullscreen-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .email-fullscreen-actions a {
    border: 1px solid rgba(96, 165, 250, 0.45);
    border-radius: 999px;
    color: #93c5fd;
    font-size: 12px;
    font-weight: 700;
    padding: 6px 12px;
    text-decoration: none;
  }

  .email-fullscreen-actions a:hover {
    background: rgba(37, 99, 235, 0.24);
    color: #ffffff;
  }

  .email-fullscreen-frame {
    flex: 1;
    width: 100%;
    min-height: 0;
    border: 0;
    background: #ffffff;
  }
</style>
