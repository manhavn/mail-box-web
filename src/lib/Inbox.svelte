<script lang="ts">
  import {
    decodePushIdTime,
    getMessage,
    getMessageFrom,
    getMessageRecipients,
    listGroups,
    listMessageIds,
    type EmailMessage,
  } from './firebase'

  // oxlint-disable-next-line no-unassigned-vars
  export let language: 'en' | 'vi'
  // oxlint-disable-next-line no-unassigned-vars
  export let t: Record<string, string>

  let groups: string[] = []
  let groupMessageCounts: Record<string, number> = {}
  let selectedGroup = ''
  let messageIds: string[] = []
  let messageSummaries: Record<string, Pick<EmailMessage, 'from' | 'recipients'>> = {}
  let selectedMessageId = ''
  let selectedMessage: EmailMessage | null = null
  let loadingGroups = true
  let loadingMessages = false
  let loadingMessage = false
  let error = ''

  $: void loadInitialGroups()

  let hasLoadedInitialGroups = false

  async function loadInitialGroups() {
    if (hasLoadedInitialGroups) return
    hasLoadedInitialGroups = true
    await loadGroups()
  }

  async function loadGroups() {
    error = ''
    loadingGroups = true

    try {
      groups = await listGroups()
      groupMessageCounts = Object.fromEntries(
        await Promise.all(
          groups.map(async (group) => [group, (await listMessageIds(group)).length] as const),
        ),
      )
      if (groups.length > 0) {
        await selectGroup(groups[0])
      }
    } catch (cause) {
      error = getErrorMessage(cause)
    } finally {
      loadingGroups = false
    }
  }

  async function selectGroup(group: string) {
    selectedGroup = group
    selectedMessageId = ''
    selectedMessage = null
    messageIds = []
    messageSummaries = {}
    error = ''
    loadingMessages = true

    try {
      messageIds = await listMessageIds(group)
      const summaries = await Promise.all(
        messageIds.map(async (id) => {
          const [from, recipients] = await Promise.all([
            getMessageFrom(group, id),
            getMessageRecipients(group, id),
          ])
          return [id, { from: from ?? undefined, recipients: recipients ?? undefined }] as const
        }),
      )
      if (selectedGroup === group) {
        messageSummaries = Object.fromEntries(summaries)
      }
      groupMessageCounts = { ...groupMessageCounts, [group]: messageIds.length }
    } catch (cause) {
      error = getErrorMessage(cause)
    } finally {
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
    const summary = messageSummaries[id]
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
      <button type="button" on:click={loadGroups} disabled={loadingGroups}>{t.refresh}</button>
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
            class:active={group === selectedGroup}
            on:click={() => selectGroup(group)}
          >
            <span class="group-name">{group}</span>
            <span class="group-count">{groupMessageCounts[group] ?? 0} {t.groupCount}</span>
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
    {:else if messageIds.length === 0}
      <p class="muted">{t.noMessages}</p>
    {:else}
      <div class="message-list">
        {#each messageIds as id}
          <button
            type="button"
            class:active={id === selectedMessageId}
            title={formatMessageTitle(id)}
            on:click={() => selectMessage(id)}
          >
            <span class="message-main">
              <span class="message-id">{id}</span>
              <span class="message-time">{formatPushTime(id)}</span>
            </span>
            <span class="message-addresses">
              <span class="message-from">{t.from}: {messageSummaries[id]?.from ?? t.unknownSender}</span>
              <span class="message-recipients">{t.to}: {formatRecipients(messageSummaries[id]?.recipients)}</span>
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
