<script lang="ts">
  import DOMPurify from 'dompurify'
  import PostalMime from 'postal-mime'
  import { onDestroy } from 'svelte'
  import {
    decodePushIdTime,
    getMessage,
    type EmailMessage,
    type MessageSummary,
    watchGroups,
    watchMessageSummaries,
  } from './firebase'

  // oxlint-disable-next-line no-unassigned-vars
  export let language: 'en' | 'vi'
  // oxlint-disable-next-line no-unassigned-vars
  export let t: Record<string, string>

  let groups: Array<{ id: string; count: number }> = []
  let selectedGroup = ''
  let messageSummaries: MessageSummary[] = []
  let selectedMessageId = ''
  let selectedMessage: EmailMessage | null = null
  let loadingGroups = true
  let loadingMessages = false
  let loadingMessage = false
  let loadingParsedEmail = false
  let dataExpanded = false
  let transcriptExpanded = false
  let parsedEmailHtml = ''
  let parsedEmailText = ''
  let parsedEmailError = ''
  let renderedEmailFullscreen = false
  let otpCode = ''
  let otpCopied = false
  let copiedField = ''
  let otpCopiedTimeout: ReturnType<typeof setTimeout> | null = null
  let copiedFieldTimeout: ReturnType<typeof setTimeout> | null = null
  let error = ''
  let unwatchGroups: (() => void) | null = null
  let unwatchMessages: (() => void) | null = null

  $: watchInitialGroups()

  onDestroy(() => {
    unwatchMessages?.()
    unwatchGroups?.()
    if (otpCopiedTimeout) clearTimeout(otpCopiedTimeout)
    if (copiedFieldTimeout) clearTimeout(copiedFieldTimeout)
  })

  function watchInitialGroups() {
    if (unwatchGroups) return
    error = ''
    loadingGroups = true

    try {
      unwatchGroups = watchGroups((nextGroups) => {
        groups = nextGroups
        loadingGroups = false

        if (groups.length === 0) {
          selectedGroup = ''
          messageSummaries = []
          unwatchMessages?.()
          unwatchMessages = null
          return
        }

        if (!selectedGroup || !groups.some((group) => group.id === selectedGroup)) {
          selectGroup(groups[0].id)
        }
      })
    } catch (cause) {
      error = getErrorMessage(cause)
      loadingGroups = false
    }
  }

  function refreshGroups() {
    unwatchGroups?.()
    unwatchGroups = null
    watchInitialGroups()
  }

  function selectGroup(group: string) {
    selectedGroup = group
    selectedMessageId = ''
    selectedMessage = null
    resetParsedEmail()
    dataExpanded = false
    transcriptExpanded = false
    messageSummaries = []
    error = ''
    loadingMessages = true
    unwatchMessages?.()
    unwatchMessages = null

    try {
      unwatchMessages = watchMessageSummaries(group, (nextMessages) => {
        if (selectedGroup !== group) return
        messageSummaries = nextMessages
        loadingMessages = false

        if (selectedMessageId && !messageSummaries.some((message) => message.id === selectedMessageId)) {
          selectedMessageId = ''
          selectedMessage = null
        }
      })
    } catch (cause) {
      error = getErrorMessage(cause)
      loadingMessages = false
    }
  }

  async function selectMessage(id: string) {
    selectedMessageId = id
    selectedMessage = null
    dataExpanded = false
    transcriptExpanded = false
    resetParsedEmail()
    error = ''
    loadingMessage = true

    try {
      selectedMessage = await getMessage(selectedGroup, id)
      await parseSelectedMessageData()
    } catch (cause) {
      error = getErrorMessage(cause)
    } finally {
      loadingMessage = false
    }
  }

  function getErrorMessage(cause: unknown) {
    return cause instanceof Error ? cause.message : String(cause)
  }

  function resetParsedEmail() {
    loadingParsedEmail = false
    parsedEmailHtml = ''
    parsedEmailText = ''
    parsedEmailError = ''
    renderedEmailFullscreen = false
    otpCode = ''
    otpCopied = false
    copiedField = ''
    if (otpCopiedTimeout) {
      clearTimeout(otpCopiedTimeout)
      otpCopiedTimeout = null
    }
    if (copiedFieldTimeout) {
      clearTimeout(copiedFieldTimeout)
      copiedFieldTimeout = null
    }
  }

  async function copyOtpCode() {
    if (!otpCode) return
    await navigator.clipboard.writeText(otpCode)
    otpCopied = true

    if (otpCopiedTimeout) clearTimeout(otpCopiedTimeout)
    otpCopiedTimeout = setTimeout(() => {
      otpCopied = false
      otpCopiedTimeout = null
    }, 1600)
  }

  async function copyTextBox(field: string, value: string) {
    if (!value) return
    await navigator.clipboard.writeText(value)
    copiedField = field

    if (copiedFieldTimeout) clearTimeout(copiedFieldTimeout)
    copiedFieldTimeout = setTimeout(() => {
      copiedField = ''
      copiedFieldTimeout = null
    }, 1600)
  }

  async function parseSelectedMessageData() {
    const data = selectedMessage?.data
    if (!data?.trim()) return

    loadingParsedEmail = true
    parsedEmailError = ''

    try {
      const parsed = await new PostalMime().parse(data)
      parsedEmailHtml = parsed.html ? DOMPurify.sanitize(parsed.html) : ''
      parsedEmailText = parsed.text ?? ''
      const renderedText = stripHtml(parsedEmailHtml)
      otpCode = extractOtpCode([renderedText, parsedEmailText, parsed.subject])
    } catch (cause) {
      parsedEmailError = getErrorMessage(cause)
      otpCode = extractOtpCode([data])
    } finally {
      loadingParsedEmail = false
    }
  }

  function stripHtml(html: string) {
    if (!html) return ''
    const element = document.createElement('div')
    element.innerHTML = html
    return element.textContent ?? ''
  }

  function extractOtpCode(values: Array<string | undefined>) {
    const text = values
      .filter(Boolean)
      .join('\n')
      .replace(/\u00a0/g, ' ')
    if (!text.trim()) return ''

    const candidates = new Map<string, number>()
    const patterns = [
      {
        regex:
          /(?:otp|one[-\s]?time|verification|verify|security|login|sign[-\s]?in|code|mã|ma|xac\s*thuc|xác\s*thực)[\s\S]{0,80}?([A-Z0-9][A-Z0-9\s-]{2,18}[A-Z0-9])/giu,
        score: 120,
      },
      {
        regex:
          /([A-Z0-9][A-Z0-9\s-]{2,18}[A-Z0-9])[\s\S]{0,80}?(?:otp|one[-\s]?time|verification|verify|security|login|sign[-\s]?in|code|mã|ma|xac\s*thuc|xác\s*thực)/giu,
        score: 90,
      },
      { regex: /\b(\d{4,8})\b/g, score: 10 },
    ]

    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern.regex)) {
        const candidate = match[1]?.replace(/[\s-]+/g, '')
        if (!candidate || !/[0-9]/.test(candidate)) continue
        if (/^(19|20)\d{2}$/.test(candidate)) continue
        if (candidate.length < 4 || candidate.length > 10) continue

        const lengthScore = candidate.length === 6 ? 20 : candidate.length >= 4 && candidate.length <= 8 ? 10 : 0
        const numericScore = /^\d+$/.test(candidate) ? 12 : 0
        candidates.set(
          candidate,
          Math.max(candidates.get(candidate) ?? 0, pattern.score + lengthScore + numericScore),
        )
      }
    }

    return [...candidates.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] ?? ''
  }

  function formatPushTime(id: string) {
    const date = decodePushIdTime(id)
    return date ? date.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US') : t.unknownTime
  }

  function formatRecipients(recipients: unknown) {
    return Array.isArray(recipients) && recipients.length > 0 ? recipients.join(', ') : t.noRecipients
  }

  function formatMessageTitle(id: string) {
    const summary = messageSummaries.find((message) => message.id === id)
    return `${t.from}: ${summary?.from ?? t.unknownSender}\n${t.to}: ${formatRecipients(summary?.recipients)}`
  }

  function getRenderedEmailDocument() {
    const body = parsedEmailHtml || `<pre>${escapeHtml(parsedEmailText)}</pre>`

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
    const from = selectedMessage?.from ?? 'unknown-sender'
    const to = formatRecipients(selectedMessage?.recipients)
    const receivedAt = selectedMessage?.received_at ?? formatPushTime(selectedMessage?.id ?? '')

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

<svelte:window on:keydown={(event) => event.key === 'Escape' && (renderedEmailFullscreen = false)} />

{#if error}
  <section class="alert">{error}</section>
{/if}

<section class="layout">
  <aside class="panel groups-panel" aria-label="Chat groups">
    <div class="panel-heading">
      <h2>{t.chatGroups}</h2>
        <button type="button" on:click={refreshGroups} disabled={loadingGroups}>{t.refresh}</button>
    </div>

    {#if loadingGroups}
      <p class="muted">{t.loadingGroups}</p>
    {:else if groups.length === 0}
      <p class="muted">{t.noGroups}</p>
    {:else}
      <div class="group-list">
        {#each groups as group}
          <button
            type="button"
            class:active={group.id === selectedGroup}
            on:click={() => selectGroup(group.id)}
          >
            <span class="group-name">{group.id}</span>
            <span class="group-count">{group.count} {t.groupCount}</span>
          </button>
        {/each}
      </div>
    {/if}
  </aside>

  <section class="panel messages-panel" aria-label="Messages">
    <div class="panel-heading">
      <div>
        <h2>{selectedGroup || t.messages}</h2>
        <p class="muted">{t.dataListHint}</p>
      </div>
    </div>

    {#if loadingMessages}
      <p class="muted">{t.loadingMessages}</p>
    {:else if !selectedGroup}
      <p class="muted">{t.chooseGroup}</p>
    {:else if messageSummaries.length === 0}
      <p class="muted">{t.noMessages}</p>
    {:else}
      <div class="message-list">
        {#each messageSummaries as message}
          <button
            type="button"
            class:active={message.id === selectedMessageId}
            title={formatMessageTitle(message.id)}
            on:click={() => selectMessage(message.id)}
          >
            <span class="message-main">
              <span class="message-id">{message.id}</span>
              <span class="message-time">{message.received_at ? new Date(message.received_at).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US') : formatPushTime(message.id)}</span>
            </span>
            <span class="message-addresses">
              <span class="message-from">{t.from}: {message.from ?? t.unknownSender}</span>
              <span class="message-recipients">{t.to}: {formatRecipients(message.recipients)}</span>
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </section>

  <section class="panel detail-panel" aria-label="Message detail">
    <div class="panel-heading">
      <h2>{t.messageContent}</h2>
    </div>

    {#if loadingMessage}
      <p class="muted">{t.loadingMessage}</p>
    {:else if !selectedMessageId}
      <p class="muted">{t.detailEmpty}</p>
    {:else if !selectedMessage}
      <p class="muted">{t.notFound}</p>
    {:else}
      <div class="detail-grid">
        <article class="text-box small">
          <div class="text-box-heading">
            <h3>ID</h3>
            <a href="#copy-id" on:click|preventDefault={() => copyTextBox('id', selectedMessage?.id ?? '')}>
              {copiedField === 'id' ? t.copied : t.copy}
            </a>
          </div>
          <pre>{selectedMessage.id}</pre>
        </article>
        <article class="text-box small">
          <div class="text-box-heading">
            <h3>{t.receivedAt}</h3>
            <a
              href="#copy-received-at"
              on:click|preventDefault={() =>
                copyTextBox('receivedAt', selectedMessage?.received_at ?? formatPushTime(selectedMessage?.id ?? ''))}
            >
              {copiedField === 'receivedAt' ? t.copied : t.copy}
            </a>
          </div>
          <pre>{selectedMessage.received_at ?? formatPushTime(selectedMessage.id)}</pre>
        </article>
        <article class="text-box small">
          <div class="text-box-heading">
            <h3>{t.from}</h3>
            <a href="#copy-from" on:click|preventDefault={() => copyTextBox('from', selectedMessage?.from ?? t.unknownSender)}>
              {copiedField === 'from' ? t.copied : t.copy}
            </a>
          </div>
          <pre>{selectedMessage.from ?? t.unknownSender}</pre>
        </article>
        <article class="text-box small">
          <div class="text-box-heading">
            <h3>{t.to}</h3>
            <a href="#copy-to" on:click|preventDefault={() => copyTextBox('to', formatRecipients(selectedMessage?.recipients))}>
              {copiedField === 'to' ? t.copied : t.copy}
            </a>
          </div>
          <pre>{formatRecipients(selectedMessage.recipients)}</pre>
        </article>
        <article class="text-box small">
          <div class="text-box-heading">
            <h3>{t.peerAddress}</h3>
            <a
              href="#copy-peer-address"
              on:click|preventDefault={() => copyTextBox('peerAddress', selectedMessage?.peer_addr ?? t.unknownPeer)}
            >
              {copiedField === 'peerAddress' ? t.copied : t.copy}
            </a>
          </div>
          <pre>{selectedMessage.peer_addr ?? t.unknownPeer}</pre>
        </article>
        <article class="text-box small otp-box">
          <div class="text-box-heading">
            <h3>{t.otpCode}</h3>
            {#if otpCode}
              <a href="#copy-otp" on:click|preventDefault={copyOtpCode}>
                {otpCopied ? t.copied : t.copy}
              </a>
            {/if}
          </div>
          <pre class:empty-otp={!otpCode}>{otpCode || t.noOtp}</pre>
        </article>
        <article class="text-box wide rendered-email-box">
          <div class="text-box-heading">
            <h3>{t.renderedEmail}</h3>
            {#if parsedEmailHtml || parsedEmailText}
              <a href="#fullscreen-email" on:click|preventDefault={() => (renderedEmailFullscreen = true)}>
                {t.renderedEmailFullScreen}
              </a>
            {/if}
          </div>

          {#if loadingParsedEmail}
            <p class="muted parsed-email-status">{t.parsingMime}</p>
          {:else if parsedEmailError}
            <p class="muted parsed-email-status">{t.renderParseFailed}: {parsedEmailError}</p>
          {:else if parsedEmailHtml}
            <div class="email-html-preview">{@html parsedEmailHtml}</div>
          {:else if parsedEmailText}
            <pre class="email-text-preview">{parsedEmailText}</pre>
          {:else}
            <p class="muted parsed-email-status">{t.noRenderedContent}</p>
          {/if}
        </article>
        <article class="text-box wide">
          <div class="text-box-heading">
            <h3>{t.data}</h3>
            <a href="#data" on:click|preventDefault={() => (dataExpanded = !dataExpanded)}>
              {dataExpanded ? t.collapse : t.expand}
            </a>
          </div>
          <pre class:collapsed-preview={!dataExpanded}>{selectedMessage.data ?? ''}</pre>
        </article>
        <article class="text-box wide">
          <div class="text-box-heading">
            <h3>{t.transcript}</h3>
            <a href="#transcript" on:click|preventDefault={() => (transcriptExpanded = !transcriptExpanded)}>
              {transcriptExpanded ? t.collapse : t.expand}
            </a>
          </div>
          <pre class:collapsed-preview={!transcriptExpanded}>{selectedMessage.transcript ?? ''}</pre>
        </article>
      </div>
    {/if}
  </section>
</section>

{#if renderedEmailFullscreen}
  <div class="email-fullscreen-backdrop" role="presentation">
    <div class="email-fullscreen-dialog" role="dialog" aria-modal="true" aria-label={t.renderedEmailFullScreen}>
      <header class="email-fullscreen-header">
        <h2>{t.renderedEmail}</h2>
        <div class="email-fullscreen-actions">
          <a href="#download-email" on:click|preventDefault={downloadRenderedEmailHtml}>{t.downloadHtml}</a>
          <a href="#close-email" on:click|preventDefault={() => (renderedEmailFullscreen = false)}>{t.close}</a>
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
{/if}
