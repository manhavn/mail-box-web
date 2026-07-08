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
  let error = ''
  let unwatchGroups: (() => void) | null = null
  let unwatchMessages: (() => void) | null = null

  $: watchInitialGroups()

  onDestroy(() => {
    unwatchMessages?.()
    unwatchGroups?.()
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
    error = ''
    loadingMessage = true

    try {
      selectedMessage = await getMessage(selectedGroup, id)
    } catch (cause) {
      error = getErrorMessage(cause)
    } finally {
      loadingMessage = false
    }
  }

  function getErrorMessage(cause: unknown) {
    return cause instanceof Error ? cause.message : String(cause)
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
</script>

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
          <h3>ID</h3>
          <pre>{selectedMessage.id}</pre>
        </article>
        <article class="text-box small">
          <h3>{t.receivedAt}</h3>
          <pre>{selectedMessage.received_at ?? formatPushTime(selectedMessage.id)}</pre>
        </article>
        <article class="text-box small">
          <h3>{t.from}</h3>
          <pre>{selectedMessage.from ?? t.unknownSender}</pre>
        </article>
        <article class="text-box small">
          <h3>{t.to}</h3>
          <pre>{formatRecipients(selectedMessage.recipients)}</pre>
        </article>
        <article class="text-box small">
          <h3>{t.peerAddress}</h3>
          <pre>{selectedMessage.peer_addr ?? t.unknownPeer}</pre>
        </article>
        <article class="text-box wide">
          <h3>Data</h3>
          <pre>{selectedMessage.data ?? ''}</pre>
        </article>
        <article class="text-box wide">
          <h3>Transcript</h3>
          <pre>{selectedMessage.transcript ?? ''}</pre>
        </article>
      </div>
    {/if}
  </section>
</section>
