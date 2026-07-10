<script lang="ts">
  import { onDestroy } from 'svelte'
  import {
    decodePushIdTime,
    getMessage,
    type EmailMessage,
    type MessageSummary,
    watchGroups,
    watchMessageSummaries,
  } from './firebase'
  import {
    downloadMessageText,
    downloadRenderedEmailHtml,
    getRenderedEmailDocument,
  } from './rendered-email'

  // oxlint-disable-next-line no-unassigned-vars
  export let language: 'en' | 'vi'
  // oxlint-disable-next-line no-unassigned-vars
  export let t: Record<string, string>

  const GROUPS_PANEL_COLLAPSED_KEY = 'mailbox-groups-panel-collapsed'

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
  let EmailFullscreenComponent: any = null
  let loadingEmailFullscreen = false
  let otpCode = ''
  let fromDisplayName = ''
  let toDisplayName = ''
  let otpCopied = false
  let copiedField = ''
  let otpCopiedTimeout: ReturnType<typeof setTimeout> | null = null
  let copiedFieldTimeout: ReturnType<typeof setTimeout> | null = null
  let error = ''
  let groupsPanelCollapsed = readGroupsPanelCollapsed()
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
    fromDisplayName = ''
    toDisplayName = ''
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

  async function openRenderedEmailFullscreen() {
    renderedEmailFullscreen = true
    if (EmailFullscreenComponent || loadingEmailFullscreen) return

    loadingEmailFullscreen = true
    try {
      EmailFullscreenComponent = (await import('./EmailFullscreen.svelte')).default
    } catch (cause) {
      error = getErrorMessage(cause)
      renderedEmailFullscreen = false
    } finally {
      loadingEmailFullscreen = false
    }
  }

  function downloadRenderedEmail() {
    if (!selectedMessage || !(parsedEmailHtml || parsedEmailText)) return
    downloadRenderedEmailHtml({
      html: parsedEmailHtml,
      text: parsedEmailText,
      message: selectedMessage,
      formatPushTime,
      formatRecipients,
    })
  }

  function downloadMessageData() {
    if (!selectedMessage?.data) return
    downloadMessageText({
      content: selectedMessage.data,
      message: selectedMessage,
      formatPushTime,
      formatRecipients,
      extension: 'data.txt',
    })
  }

  function downloadMessageTranscript() {
    if (!selectedMessage?.transcript) return
    downloadMessageText({
      content: selectedMessage.transcript,
      message: selectedMessage,
      formatPushTime,
      formatRecipients,
      extension: 'transcript.txt',
    })
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
    const message = selectedMessage
    const data = message?.data
    if (!message) return

    // Fill names immediately so the box is ready even before MIME parse finishes.
    setDisplayNames(extractMessageDisplayNames(message))
    if (!data?.trim()) return

    loadingParsedEmail = true
    parsedEmailError = ''

    try {
      const [{ default: PostalMime }, { default: DOMPurify }] = await Promise.all([
        import('postal-mime'),
        import('dompurify'),
      ])
      const parsed = await new PostalMime().parse(data)
      parsedEmailHtml = parsed.html ? DOMPurify.sanitize(parsed.html) : ''
      parsedEmailText = parsed.text ?? ''
      const renderedText = stripHtml(parsedEmailHtml)
      otpCode = extractOtpCode([renderedText, parsedEmailText, parsed.subject])
      setDisplayNames(
        extractMessageDisplayNames(message, {
          from: getAddressDisplayName(parsed.from),
          to: getAddressDisplayName(parsed.to),
        }),
      )
    } catch (cause) {
      parsedEmailError = getErrorMessage(cause)
      otpCode = extractOtpCode([data])
      setDisplayNames(extractMessageDisplayNames(message))
    } finally {
      loadingParsedEmail = false
    }
  }

  function setDisplayNames(names: { fromName: string; toName: string }) {
    fromDisplayName = names.fromName
    toDisplayName = names.toName
  }

  function formatDisplayNamesForCopy() {
    return [
      fromDisplayName ? `${t.from}: ${fromDisplayName}` : '',
      toDisplayName ? `${t.to}: ${toDisplayName}` : '',
    ]
      .filter(Boolean)
      .join('\n')
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
    return `${t.subject}: ${summary?.subject || id}\n${t.from}: ${summary?.from ?? t.unknownSender}\n${t.to}: ${formatRecipients(summary?.recipients)}`
  }

  function formatGroupTitle(group: { id: string; count: number }) {
    return `${group.id}\n${group.count} ${t.groupCount}`
  }

  function readGroupsPanelCollapsed() {
    try {
      return localStorage.getItem(GROUPS_PANEL_COLLAPSED_KEY) === 'true'
    } catch {
      return false
    }
  }

  function setGroupsPanelCollapsed(next: boolean) {
    groupsPanelCollapsed = next
    try {
      localStorage.setItem(GROUPS_PANEL_COLLAPSED_KEY, String(next))
    } catch {
      // Ignore storage write failures (private mode, quota, etc).
    }
  }

  function normalizeDisplayName(name: string) {
    const value = name.trim().replace(/^["']|["']$/g, '')
    if (!value || value.includes('@')) return ''
    // Ignore accidental header prefixes if a full line was passed in.
    if (/^(from|to)\s*:/i.test(value)) return ''
    return value
  }

  function extractDisplayNameFromAddress(address: string) {
    const value = address.trim()
    if (!value) return ''

    // "Display Name" <email@x.com> or Display Name <email@x.com>
    const angleMatch = value.match(/^(?:"([^"]+)"|([^<]+?))\s*<[^<>\s]+@[^<>\s]+>\s*$/)
    if (!angleMatch) return ''

    return normalizeDisplayName(angleMatch[1] ?? angleMatch[2] ?? '')
  }

  function extractDisplayNamesFromHeaderValue(value: string) {
    const names: string[] = []
    const pattern = /(?:"([^"]+)"|([^,<]+?))\s*<[^<>\s]+@[^<>\s]+>/g
    for (const match of value.matchAll(pattern)) {
      const name = normalizeDisplayName(match[1] ?? match[2] ?? '')
      if (name) names.push(name)
    }
    return names
  }

  function extractHeaderValue(data: string, header: 'From' | 'To') {
    // Include folded header continuation lines (leading space/tab on next line).
    const match = data.match(new RegExp(`^${header}:\\s*([^\\r\\n]*(?:\\r?\\n[ \\t]+[^\\r\\n]*)*)`, 'im'))
    return match?.[1]?.replace(/\r?\n[ \t]+/g, ' ').trim() ?? ''
  }

  function getAddressDisplayName(address: unknown): string {
    if (!address) return ''

    const names: string[] = []
    const entries = Array.isArray(address) ? address : [address]
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue
      const record = entry as { name?: string; group?: Array<{ name?: string }> }
      if (Array.isArray(record.group)) {
        for (const mailbox of record.group) {
          const groupName = normalizeDisplayName(mailbox?.name ?? '')
          if (groupName) names.push(groupName)
        }
        continue
      }
      const name = normalizeDisplayName(record.name ?? '')
      if (name) names.push(name)
    }
    return [...new Set(names)].join(', ')
  }

  function firstNonEmpty(...values: Array<string | undefined>) {
    return values.map((value) => value?.trim() ?? '').find(Boolean) ?? ''
  }

  function extractMessageDisplayNames(
    message: EmailMessage,
    parsedNames: { from?: string; to?: string } = {},
  ) {
    const fromName = firstNonEmpty(
      parsedNames.from,
      extractDisplayNameFromAddress(message.from ?? ''),
      ...extractDisplayNamesFromHeaderValue(extractHeaderValue(message.data ?? '', 'From')),
    )

    const toName = firstNonEmpty(
      parsedNames.to,
      ...(Array.isArray(message.recipients)
        ? message.recipients.map((recipient) => extractDisplayNameFromAddress(String(recipient)))
        : []),
      ...extractDisplayNamesFromHeaderValue(extractHeaderValue(message.data ?? '', 'To')),
    )

    return { fromName, toName }
  }

</script>

{#if error}
  <section class="alert">{error}</section>
{/if}

<section class="layout" class:groups-collapsed={groupsPanelCollapsed}>
  <aside class="panel groups-panel" class:collapsed={groupsPanelCollapsed} aria-label="Chat groups">
    <div class="panel-heading">
      <h2>{t.chatGroups}</h2>
      <button
        type="button"
        class="panel-toggle"
        title={groupsPanelCollapsed ? t.expand : t.collapse}
        aria-label={groupsPanelCollapsed ? t.expand : t.collapse}
        aria-expanded={!groupsPanelCollapsed}
        on:click={() => setGroupsPanelCollapsed(!groupsPanelCollapsed)}
      >
        {groupsPanelCollapsed ? '»' : '«'}
      </button>
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
            title={formatGroupTitle(group)}
            on:click={() => selectGroup(group.id)}
          >
            <span class="group-name">{group.id}</span>
            <span class="group-count">
              {group.count}<span class="group-count-label">&nbsp;{t.groupCount}</span>
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </aside>

  <section class="panel messages-panel" aria-label="Messages">
    <div class="panel-heading" title={t.dataListHint}>
      <h2>{selectedGroup || t.messages}</h2>
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
              <span class="message-id" title={message.subject || message.id}>{message.subject || message.id}</span>
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
        <article class="text-box small">
          <div class="text-box-heading">
            <h3>{t.subject}</h3>
            <a href="#copy-subject" on:click|preventDefault={() => copyTextBox('subject', selectedMessage?.subject || selectedMessage?.id || '')}>
              {copiedField === 'subject' ? t.copied : t.copy}
            </a>
          </div>
          <pre>{selectedMessage.subject || selectedMessage.id}</pre>
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
        <article class="text-box small name-box">
          <div class="text-box-heading">
            <h3>{t.displayName}</h3>
            {#if fromDisplayName || toDisplayName}
              <a
                href="#copy-display-name"
                on:click|preventDefault={() => copyTextBox('displayName', formatDisplayNamesForCopy())}
              >
                {copiedField === 'displayName' ? t.copied : t.copy}
              </a>
            {/if}
          </div>
          {#if fromDisplayName || toDisplayName}
            <div class="name-lines">
              {#if fromDisplayName}
                <div class="name-line" title={`${t.from}: ${fromDisplayName}`}>
                  <span class="name-label">{t.from}:</span>
                  <span class="name-value">{fromDisplayName}</span>
                </div>
              {/if}
              {#if toDisplayName}
                <div class="name-line" title={`${t.to}: ${toDisplayName}`}>
                  <span class="name-label">{t.to}:</span>
                  <span class="name-value">{toDisplayName}</span>
                </div>
              {/if}
            </div>
          {:else}
            <pre class="empty-name">{t.noDisplayName}</pre>
          {/if}
        </article>
        <article class="text-box wide rendered-email-box">
          <div class="text-box-heading">
            <h3>{t.renderedEmail}</h3>
            {#if parsedEmailHtml || parsedEmailText}
              <div class="text-box-actions">
                <a
                  class="icon-link"
                  href="#download-email"
                  title={t.downloadHtml}
                  aria-label={t.downloadHtml}
                  on:click|preventDefault={downloadRenderedEmail}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                    <path d="M10 2.5a.75.75 0 0 1 .75.75v8.19l2.72-2.72a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 1 1 1.06-1.06l2.72 2.72V3.25A.75.75 0 0 1 10 2.5Zm-5 12a.75.75 0 0 1 .75.75v1h8.5v-1a.75.75 0 0 1 1.5 0V17a.75.75 0 0 1-.75.75H5a.75.75 0 0 1-.75-.75v-1.75A.75.75 0 0 1 5 14.5Z" />
                  </svg>
                </a>
                <a href="#fullscreen-email" on:click|preventDefault={openRenderedEmailFullscreen}>
                  {t.renderedEmailFullScreen}
                </a>
              </div>
            {/if}
          </div>

          {#if loadingParsedEmail}
            <p class="muted parsed-email-status">{t.parsingMime}</p>
          {:else if parsedEmailError}
            <p class="muted parsed-email-status">{t.renderParseFailed}: {parsedEmailError}</p>
          {:else if parsedEmailHtml || parsedEmailText}
            <iframe
              class="email-html-preview"
              title={t.renderedEmail}
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              srcdoc={getRenderedEmailDocument(parsedEmailHtml, parsedEmailText)}
            ></iframe>
          {:else}
            <p class="muted parsed-email-status">{t.noRenderedContent}</p>
          {/if}
        </article>
        <article class="text-box wide">
          <div class="text-box-heading">
            <h3>{t.data}</h3>
            <div class="text-box-actions">
              {#if selectedMessage.data}
                <a
                  class="icon-link"
                  href="#download-data"
                  title={t.downloadData}
                  aria-label={t.downloadData}
                  on:click|preventDefault={downloadMessageData}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                    <path d="M10 2.5a.75.75 0 0 1 .75.75v8.19l2.72-2.72a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 1 1 1.06-1.06l2.72 2.72V3.25A.75.75 0 0 1 10 2.5Zm-5 12a.75.75 0 0 1 .75.75v1h8.5v-1a.75.75 0 0 1 1.5 0V17a.75.75 0 0 1-.75.75H5a.75.75 0 0 1-.75-.75v-1.75A.75.75 0 0 1 5 14.5Z" />
                  </svg>
                </a>
              {/if}
              <a href="#data" on:click|preventDefault={() => (dataExpanded = !dataExpanded)}>
                {dataExpanded ? t.collapse : t.expand}
              </a>
            </div>
          </div>
          <pre class:collapsed-preview={!dataExpanded}>{selectedMessage.data ?? ''}</pre>
        </article>
        <article class="text-box wide">
          <div class="text-box-heading">
            <h3>{t.transcript}</h3>
            <div class="text-box-actions">
              {#if selectedMessage.transcript}
                <a
                  class="icon-link"
                  href="#download-transcript"
                  title={t.downloadTranscript}
                  aria-label={t.downloadTranscript}
                  on:click|preventDefault={downloadMessageTranscript}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                    <path d="M10 2.5a.75.75 0 0 1 .75.75v8.19l2.72-2.72a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 1 1 1.06-1.06l2.72 2.72V3.25A.75.75 0 0 1 10 2.5Zm-5 12a.75.75 0 0 1 .75.75v1h8.5v-1a.75.75 0 0 1 1.5 0V17a.75.75 0 0 1-.75.75H5a.75.75 0 0 1-.75-.75v-1.75A.75.75 0 0 1 5 14.5Z" />
                  </svg>
                </a>
              {/if}
              <a href="#transcript" on:click|preventDefault={() => (transcriptExpanded = !transcriptExpanded)}>
                {transcriptExpanded ? t.collapse : t.expand}
              </a>
            </div>
          </div>
          <pre class:collapsed-preview={!transcriptExpanded}>{selectedMessage.transcript ?? ''}</pre>
        </article>
      </div>
    {/if}
  </section>
</section>

{#if renderedEmailFullscreen}
  {#if EmailFullscreenComponent && selectedMessage}
    <svelte:component
      this={EmailFullscreenComponent}
      html={parsedEmailHtml}
      text={parsedEmailText}
      message={selectedMessage}
      {t}
      {formatPushTime}
      {formatRecipients}
      close={() => (renderedEmailFullscreen = false)}
    />
  {/if}
{/if}
