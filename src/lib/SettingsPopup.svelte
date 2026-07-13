<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import type { AuthUser } from './firebase-app'
  import {
    createRandomEmail,
    deleteRandomEmail,
    saveEmailPrefix,
    saveRandomDomains,
    updateRandomEmailLabel,
    watchEmailPrefix,
    watchRandomEmails,
    watchRandomDomains,
    watchSearchRandomEmails,
    updateRandomEmailsOrder,
    type RandomEmail,
  } from './firebase'

  const PAGE_SIZE = 10
  const mxRecords = parseMxRecords(import.meta.env.VITE_RANDOM_EMAIL_MX_RECORDS as string | undefined)

  // oxlint-disable-next-line no-unassigned-vars
  export let user: AuthUser
  // oxlint-disable-next-line no-unassigned-vars
  export let t: Record<string, string>
  // oxlint-disable-next-line no-unassigned-vars
  export let close: () => void

  let domains: string[] = []
  let domainInput = ''
  let emailPrefix = ''
  let emailSearch = ''
  let manualEmailInput = ''
  let randomEmails: RandomEmail[] = []
  let visibleEmailLimit = PAGE_SIZE
  let pendingDeleteDomain = ''
  let pendingDeleteEmail: RandomEmail | null = null
  let ConfirmPopupComponent: any = null
  let loadingEmails = false
  let loadingMoreEmails = false
  let loadingConfirmPopup = false
  let hasMoreEmails = true
  let savingDomains = false
  let creatingEmail = false
  let addingManualEmail = false
  let savingManualEmail = false
  let editingEmailLabelId = ''
  let emailLabelInput = ''
  let savingEmailLabelId = ''
  let copiedEmailId = ''
  let copiedMxRecord = ''
  let error = ''
  let unwatchDomains: (() => void) | null = null
  let unwatchEmailPrefix: (() => void) | null = null
  let unwatchRandomEmails: (() => void) | null = null
  let saveEmailPrefixTimeout: ReturnType<typeof setTimeout> | null = null
  let searchEmailsTimeout: ReturnType<typeof setTimeout> | null = null
  let copiedEmailTimeout: ReturnType<typeof setTimeout> | null = null
  let mxCopiedTimeout: ReturnType<typeof setTimeout> | null = null

  $: canCreateRandomEmail = domains.length > 0 && !creatingEmail
  $: normalizedManualEmail = normalizeManualEmail(manualEmailInput)
  $: canSaveManualEmail = !!normalizedManualEmail && !savingManualEmail

  onMount(() => {
    unwatchDomains = watchRandomDomains(user.uid, (nextDomains) => {
      domains = nextDomains
    })
    unwatchEmailPrefix = watchEmailPrefix(user.uid, (nextPrefix) => {
      emailPrefix = nextPrefix
    })
    watchInitialEmails()
  })

  onDestroy(() => {
    unwatchDomains?.()
    unwatchEmailPrefix?.()
    unwatchRandomEmails?.()
    if (saveEmailPrefixTimeout) clearTimeout(saveEmailPrefixTimeout)
    if (searchEmailsTimeout) clearTimeout(searchEmailsTimeout)
    if (copiedEmailTimeout) clearTimeout(copiedEmailTimeout)
    if (mxCopiedTimeout) clearTimeout(mxCopiedTimeout)
  })

  async function addDomainFromInput() {
    const domain = normalizeDomain(domainInput)
    if (!domain || domains.includes(domain)) {
      domainInput = ''
      return
    }

    error = ''
    savingDomains = true
    domainInput = ''

    try {
      await saveRandomDomains(user.uid, [...domains, domain])
    } catch (cause) {
      error = getErrorMessage(cause)
    } finally {
      savingDomains = false
    }
  }

  async function requestRemoveDomain(domain: string) {
    pendingDeleteDomain = domain
    await loadConfirmPopup()
  }

  function updateEmailPrefix(value: string) {
    emailPrefix = value
  }

  function saveNormalizedEmailPrefix() {
    emailPrefix = normalizeEmailPrefix(emailPrefix)
    scheduleSaveEmailPrefix()
  }

  function scheduleSaveEmailPrefix() {
    if (saveEmailPrefixTimeout) clearTimeout(saveEmailPrefixTimeout)
    savingDomains = true
    saveEmailPrefixTimeout = setTimeout(() => {
      void persistEmailPrefix()
    }, 250)
  }

  async function persistEmailPrefix() {
    error = ''
    try {
      await saveEmailPrefix(user.uid, emailPrefix)
    } catch (cause) {
      error = getErrorMessage(cause)
    } finally {
      savingDomains = false
      saveEmailPrefixTimeout = null
    }
  }

  function watchInitialEmails(showLoading = true) {
    error = ''
    if (showLoading) loadingEmails = true
    try {
      const searchTerm = emailSearch.trim()
      const pageSize = searchTerm ? PAGE_SIZE : visibleEmailLimit
      unwatchRandomEmails?.()
      unwatchRandomEmails = searchTerm
        ? watchSearchRandomEmails(user.uid, normalizeEmailSearch(searchTerm), pageSize, updateWatchedEmails)
        : watchRandomEmails(user.uid, pageSize, updateWatchedEmails)
      hasMoreEmails = !searchTerm
    } catch (cause) {
      error = getErrorMessage(cause)
      loadingEmails = false
      loadingMoreEmails = false
      unwatchRandomEmails = null
    }
  }

  function updateWatchedEmails(nextEmails: RandomEmail[]) {
    randomEmails = nextEmails
    hasMoreEmails = !emailSearch.trim() && nextEmails.length === visibleEmailLimit
    loadingEmails = false
    loadingMoreEmails = false
  }

  function loadMoreEmails() {
    if (emailSearch.trim() || loadingEmails || loadingMoreEmails || !hasMoreEmails || randomEmails.length === 0) return

    error = ''
    loadingMoreEmails = true
    visibleEmailLimit += PAGE_SIZE
    watchInitialEmails(false)
  }

  function handleEmailScroll(event: Event) {
    const element = event.currentTarget as HTMLElement
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 48) {
      void loadMoreEmails()
    }
  }

  function updateEmailSearch(value: string) {
    emailSearch = value
    visibleEmailLimit = PAGE_SIZE
    if (searchEmailsTimeout) clearTimeout(searchEmailsTimeout)
    searchEmailsTimeout = setTimeout(() => {
      watchInitialEmails()
      searchEmailsTimeout = null
    }, 300)
  }

  function closeOnBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) close()
  }

  async function getRandomEmail() {
    if (!canCreateRandomEmail) return

    const domain = domains[Math.floor(Math.random() * domains.length)]
    const email = `${createRandomLocalPart(emailPrefix)}@${domain}`
    error = ''
    creatingEmail = true

    try {
      const minOrder = randomEmails.length > 0
        ? Math.min(...randomEmails.map(e => e.order !== undefined ? e.order : 0))
        : 0
      const newOrder = minOrder - 1
      await createRandomEmail(user.uid, email, domain, newOrder)
    } catch (cause) {
      error = getErrorMessage(cause)
    } finally {
      creatingEmail = false
    }
  }

  async function saveManualEmail() {
    const email = normalizedManualEmail
    if (!email || savingManualEmail) return

    const domain = email.split('@')[1]
    error = ''
    savingManualEmail = true

    try {
      const minOrder = randomEmails.length > 0
        ? Math.min(...randomEmails.map(e => e.order !== undefined ? e.order : 0))
        : 0
      const newOrder = minOrder - 1
      await createRandomEmail(user.uid, email, domain, newOrder)
      manualEmailInput = ''
      addingManualEmail = false
    } catch (cause) {
      error = getErrorMessage(cause)
    } finally {
      savingManualEmail = false
    }
  }

  async function moveEmail(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= randomEmails.length) return

    const nextEmails = [...randomEmails]
    const temp = nextEmails[index]
    nextEmails[index] = nextEmails[targetIndex]
    nextEmails[targetIndex] = temp

    const emailOrders = nextEmails.map((email, idx) => ({
      id: email.id,
      order: idx,
    }))

    error = ''
    try {
      await updateRandomEmailsOrder(user.uid, emailOrders)
    } catch (cause) {
      error = getErrorMessage(cause)
    }
  }

  async function copyEmail(randomEmail: RandomEmail) {
    await navigator.clipboard.writeText(randomEmail.email)
    copiedEmailId = randomEmail.id

    if (copiedEmailTimeout) clearTimeout(copiedEmailTimeout)
    copiedEmailTimeout = setTimeout(() => {
      copiedEmailId = ''
      copiedEmailTimeout = null
    }, 1600)
  }

  async function copyMxRecord(record: { host: string; priority: string; server: string; ttl: string }) {
    const value = formatMxRecordForCopy(record)

    await navigator.clipboard.writeText(value)
    copiedMxRecord = value

    if (mxCopiedTimeout) clearTimeout(mxCopiedTimeout)
    mxCopiedTimeout = setTimeout(() => {
      copiedMxRecord = ''
      mxCopiedTimeout = null
    }, 1600)
  }

  function editEmailLabel(randomEmail: RandomEmail) {
    editingEmailLabelId = randomEmail.id
    emailLabelInput = randomEmail.label ?? ''
  }

  function cancelEmailLabelEdit() {
    editingEmailLabelId = ''
    emailLabelInput = ''
  }

  async function saveEmailLabel(randomEmail: RandomEmail) {
    error = ''
    savingEmailLabelId = randomEmail.id

    try {
      await updateRandomEmailLabel(user.uid, randomEmail.id, emailLabelInput)
      cancelEmailLabelEdit()
    } catch (cause) {
      error = getErrorMessage(cause)
    } finally {
      savingEmailLabelId = ''
    }
  }

  async function requestRemoveEmail(randomEmail: RandomEmail) {
    pendingDeleteEmail = randomEmail
    await loadConfirmPopup()
  }

  async function loadConfirmPopup() {
    if (ConfirmPopupComponent || loadingConfirmPopup) return

    loadingConfirmPopup = true
    try {
      ConfirmPopupComponent = (await import('./ConfirmPopup.svelte')).default
    } catch (cause) {
      error = getErrorMessage(cause)
      pendingDeleteDomain = ''
      pendingDeleteEmail = null
    } finally {
      loadingConfirmPopup = false
    }
  }

  async function removePendingDomain() {
    if (!pendingDeleteDomain) return

    const nextDomains = domains.filter((currentDomain) => currentDomain !== pendingDeleteDomain)
    error = ''
    savingDomains = true

    try {
      await saveRandomDomains(user.uid, nextDomains)
    } catch (cause) {
      error = getErrorMessage(cause)
    } finally {
      savingDomains = false
    }

    pendingDeleteDomain = ''
  }

  async function removePendingEmail() {
    const randomEmail = pendingDeleteEmail
    if (!randomEmail) return

    error = ''
    try {
      await deleteRandomEmail(user.uid, randomEmail.id)
      randomEmails = randomEmails.filter((email) => email.id !== randomEmail.id)
      pendingDeleteEmail = null
    } catch (cause) {
      error = getErrorMessage(cause)
    }
  }

  function closeConfirmPopup() {
    pendingDeleteDomain = ''
    pendingDeleteEmail = null
  }

  function normalizeDomain(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^@/, '')
      .split('/')[0]
      .replace(/[^a-z0-9.-]/g, '')
      .replace(/^\.+|\.+$/g, '')
  }

  function normalizeEmailPrefix(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._+-]/g, '')
      .replace(/^[._+-]+/g, '')
  }

  function normalizeEmailSearch(value: string) {
    return value.trim().toLowerCase()
  }

  function normalizeManualEmail(value: string) {
    const email = value.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ''
    return email
  }

  function createRandomLocalPart(prefix: string) {
    const bytes = crypto.getRandomValues(new Uint8Array(8))
    const randomPart = Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 12)
    return prefix ? `${prefix}${randomPart}` : randomPart
  }

  function formatCreatedAt(value: string) {
    return new Date(value).toLocaleString()
  }

  function getErrorMessage(cause: unknown) {
    return cause instanceof Error ? cause.message : String(cause)
  }

  function parseMxRecords(value: string | undefined) {
    return (value ?? '')
      .split(',')
      .map((server) => server.trim())
      .filter(Boolean)
      .map((server, index) => {
        const normalizedServer = server.endsWith('.') ? server : `${server}.`
        return { host: '@', priority: String((index + 1) * 10), server: normalizedServer, ttl: '3600' }
      })
  }

  function formatMxRecordForCopy(record: { host: string; priority: string; server: string; ttl: string }) {
    return `Type=MX Host=${record.host} Priority=${record.priority} Value=${record.server} TTL=${record.ttl}`
  }
</script>

<svelte:window on:keydown={(event) => event.key === 'Escape' && close()} />

<div class="settings-backdrop" role="presentation" on:click={closeOnBackdrop}>
  <dialog class="settings-dialog" aria-modal="true" aria-label={t.settings} open>
    <header class="settings-header">
      <div>
        <h2>{t.settings}</h2>
      </div>
      <div class="settings-header-actions">
        <a href="https://github.com/manhavn/mail-box" target="_blank" rel="noreferrer">{t.sourceCodeServer}</a>
        <a href="https://github.com/manhavn/mail-box-web" target="_blank" rel="noreferrer">{t.sourceCodeUi}</a>
        <button type="button" class="ghost-button" on:click={close}>{t.close}</button>
      </div>
    </header>

    {#if error}
      <p class="settings-alert">{error}</p>
    {/if}

    <article class="settings-box">
      <div class="settings-box-heading">
        <div class="domain-title-row">
          <h3>{t.randomDomain}</h3>
          <button type="button" class="mx-help" aria-label={t.randomDomainMxTip}>?</button>
          <div class="mx-tooltip" role="tooltip">
            <p>{t.randomDomainMxIntro}</p>
            <p>{t.randomDomainMxFormat}</p>
            <p>{t.randomDomainMxRootHelp}</p>
            <p>{t.randomDomainMxSubdomainHelp}</p>
            {#if mxRecords.length > 0}
              <div class="mx-tooltip-heading">
                <strong>{t.randomDomainMxExample}</strong>
              </div>
              <div class="mx-record-list">
                {#each mxRecords as record}
                  <div class="mx-record-row">
                    <code>{formatMxRecordForCopy(record)}</code>
                    <button type="button" on:click={() => copyMxRecord(record)}>
                      {copiedMxRecord === formatMxRecordForCopy(record) ? t.copied : t.copy}
                    </button>
                  </div>
                {/each}
              </div>
              <p class="mx-record-help">{t.randomDomainMxSubdomainRecordHelp}</p>
            {:else}
              <p>{t.randomDomainMxMissing}</p>
            {/if}
          </div>
        </div>
        {#if savingDomains}
          <span>{t.saving}</span>
        {/if}
      </div>
      <div class="domain-tags">
        {#each domains as domain}
          <span class="domain-chip">
            {domain}
            <button type="button" aria-label={`${t.delete} ${domain}`} on:click={() => requestRemoveDomain(domain)}>x</button>
          </span>
        {/each}
        <input
          id="random-domain-input"
          bind:value={domainInput}
          placeholder={domains.length ? t.addDomain : t.randomDomainPlaceholder}
          on:keydown={(event) => {
            if (event.key === 'Enter' || event.key === ',' || event.key === 'Tab') {
              event.preventDefault()
              void addDomainFromInput()
            }
          }}
          on:blur={() => void addDomainFromInput()}
        />
      </div>
    </article>

    <article class="settings-box prefix-action-box">
      <label class="prefix-field">
        <span>{t.emailPrefix}</span>
        <input
          class="prefix-input"
          value={emailPrefix}
          placeholder={t.emailPrefixPlaceholder}
          on:input={(event) => updateEmailPrefix(event.currentTarget.value)}
          on:blur={saveNormalizedEmailPrefix}
        />
      </label>
      <button type="button" class="primary-button" on:click={getRandomEmail} disabled={!canCreateRandomEmail}>
        {creatingEmail ? t.creatingEmail : t.getRandomEmail}
      </button>
    </article>

    <section class="random-email-panel">
      <div class="settings-box-heading">
        <h3>{t.randomEmails}</h3>
        <input
          class="search-input"
          value={emailSearch}
          placeholder={t.searchEmail}
          on:input={(event) => updateEmailSearch(event.currentTarget.value)}
        />
        <button type="button" class="ghost-button small" on:click={() => (addingManualEmail = !addingManualEmail)}>
          {addingManualEmail ? t.cancelAddEmail : t.addEmail}
        </button>
      </div>

      {#if addingManualEmail}
        <form
          class="manual-email-form"
          on:submit|preventDefault={saveManualEmail}
        >
          <input
            class="manual-email-input"
            type="email"
            bind:value={manualEmailInput}
            placeholder={t.addEmailPlaceholder}
            autocomplete="off"
          />
          <button type="submit" class="primary-button small" disabled={!canSaveManualEmail}>
            {savingManualEmail ? t.saving : t.save}
          </button>
        </form>
      {/if}

      {#if loadingEmails}
        <p class="muted">{t.loadingEmails}</p>
      {:else if randomEmails.length === 0}
        <p class="muted">{t.noRandomEmails}</p>
      {:else}
        <div class="random-email-list" on:scroll={handleEmailScroll}>
          {#each randomEmails as randomEmail, index}
            <article class="random-email-item">
              <div class="reorder-actions">
                <button
                  type="button"
                  class="icon-button"
                  title={t.moveUp}
                  disabled={index === 0}
                  on:click={() => moveEmail(index, 'up')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m18 15-6-6-6 6"/>
                  </svg>
                </button>
                <button
                  type="button"
                  class="icon-button"
                  title={t.moveDown}
                  disabled={index === randomEmails.length - 1}
                  on:click={() => moveEmail(index, 'down')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </button>
              </div>
              <div class="random-email-info">
                {#if randomEmail.label}
                  <span class="random-email-label">{randomEmail.label}</span>
                {/if}
                <strong>{randomEmail.email}</strong>
                <span>{formatCreatedAt(randomEmail.created_at)}</span>
                {#if editingEmailLabelId === randomEmail.id}
                  <form class="email-label-form" on:submit|preventDefault={() => saveEmailLabel(randomEmail)}>
                    <input
                      class="email-label-input"
                      bind:value={emailLabelInput}
                      placeholder={t.randomEmailLabelPlaceholder}
                      autocomplete="off"
                    />
                    <button type="submit" class="label-save-button" disabled={savingEmailLabelId === randomEmail.id}>{savingEmailLabelId === randomEmail.id ? t.saving : t.save}</button>
                    <button type="button" class="ghost-button small" on:click={cancelEmailLabelEdit}>{t.cancel}</button>
                  </form>
                {/if}
              </div>
              <div class="random-email-actions">
                <button
                  type="button"
                  class="icon-button"
                  title={t.editLabel}
                  on:click={() => editEmailLabel(randomEmail)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9"/>
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                  </svg>
                </button>
                <button
                  type="button"
                  class="icon-button"
                  class:success={copiedEmailId === randomEmail.id}
                  title={copiedEmailId === randomEmail.id ? t.copied : t.copyEmail}
                  on:click={() => copyEmail(randomEmail)}
                >
                  {#if copiedEmailId === randomEmail.id}
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M20 6 9 17l-5-5"/>
                    </svg>
                  {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                    </svg>
                  {/if}
                </button>
                <button
                  type="button"
                  class="icon-button danger"
                  title={t.delete}
                  on:click={() => requestRemoveEmail(randomEmail)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"/>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            </article>
          {/each}
          {#if loadingMoreEmails}
            <p class="muted loading-more">{t.loadingEmails}</p>
          {/if}
        </div>
      {/if}
    </section>
  </dialog>
</div>

{#if (pendingDeleteEmail || pendingDeleteDomain) && ConfirmPopupComponent}
  <svelte:component
    this={ConfirmPopupComponent}
    title={pendingDeleteEmail ? t.deleteRandomEmailTitle : t.deleteRandomDomainTitle}
    message={pendingDeleteEmail
      ? `${t.deleteRandomEmailMessage} ${pendingDeleteEmail.email}`
      : `${t.deleteRandomDomainMessage} ${pendingDeleteDomain}`}
    confirmLabel={t.delete}
    cancelLabel={t.cancel}
    confirm={pendingDeleteEmail ? removePendingEmail : removePendingDomain}
    close={closeConfirmPopup}
  />
{/if}

<style>
  .settings-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    background: rgba(3, 7, 18, 0.72);
    padding: 12px;
    box-sizing: border-box;
  }

  .settings-dialog {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: min(720px, 100%);
    height: min(960px, calc(100vh - 24px));
    max-height: calc(100vh - 24px);
    border: 1px solid var(--line);
    border-radius: 28px;
    background: rgba(14, 26, 43, 0.96);
    box-shadow: var(--shadow);
    padding: 16px;
    box-sizing: border-box;
  }

  .settings-header,
  .settings-box-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .random-email-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .settings-box-heading span {
    color: var(--muted);
    font-size: 12px;
  }

  .settings-header-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }

  .settings-header-actions a {
    flex: 0 0 auto;
    border: 1px solid rgba(96, 165, 250, 0.45);
    border-radius: 999px;
    color: var(--accent-strong);
    font-size: 12px;
    font-weight: 700;
    padding: 8px 12px;
    text-decoration: none;
  }

  .settings-header-actions a:hover {
    background: rgba(37, 99, 235, 0.24);
    color: var(--heading);
  }

  .domain-title-row {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .domain-title-row::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 0;
    width: min(520px, calc(100vw - 48px));
    height: 8px;
  }

  .mx-help {
    display: inline-grid;
    place-items: center;
    width: 17px;
    height: 17px;
    border: 1px solid rgba(96, 165, 250, 0.45);
    border-radius: 999px;
    background: rgba(96, 165, 250, 0.12);
    color: var(--accent-strong);
    cursor: help;
    font-size: 11px;
    font-weight: 800;
    line-height: 1;
  }

  .mx-help:hover {
    background: rgba(96, 165, 250, 0.22);
    color: var(--heading);
  }

  .mx-tooltip {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    z-index: 90;
    display: none;
    width: min(520px, calc(100vw - 48px));
    border: 1px solid rgba(96, 165, 250, 0.32);
    border-radius: 16px;
    background: rgba(8, 17, 31, 0.98);
    box-shadow: var(--shadow);
    color: var(--text);
    padding: 12px;
  }

  .domain-title-row:hover .mx-tooltip,
  .domain-title-row:focus-within .mx-tooltip {
    display: block;
  }

  .mx-tooltip p {
    margin: 0 0 8px;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.45;
    text-transform: none;
  }

  .mx-tooltip strong {
    display: block;
    color: var(--accent-strong);
    font-size: 12px;
  }

  .mx-tooltip-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 6px;
  }

  .mx-record-row button {
    flex: 0 0 auto;
    border: 1px solid rgba(96, 165, 250, 0.45);
    border-radius: 999px;
    background: rgba(37, 99, 235, 0.24);
    color: var(--accent-strong);
    cursor: pointer;
    font-size: 11px;
    font-weight: 800;
    padding: 4px 9px;
  }

  .mx-record-row button:hover {
    background: rgba(37, 99, 235, 0.36);
    color: var(--heading);
  }

  .mx-record-list {
    display: grid;
    gap: 6px;
  }

  .mx-record-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
  }

  .mx-record-list code {
    display: block;
    overflow-x: auto;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: rgba(18, 36, 59, 0.72);
    color: #e5eefb;
    font-family: var(--mono);
    font-size: 11px;
    padding: 7px 8px;
    white-space: nowrap;
  }

  .mx-tooltip .mx-record-help {
    margin: 8px 0 0;
    color: #b6c9e3;
    font-size: 11px;
  }

  .settings-box,
  .random-email-panel {
    border: 1px solid var(--line);
    border-radius: 20px;
    background: rgba(8, 17, 31, 0.68);
    padding: 12px;
  }

  .prefix-action-box {
    display: flex;
    align-items: end;
    gap: 12px;
  }

  .prefix-field {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 8px;
  }

  .prefix-field span {
    color: var(--accent-strong);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .domain-tags {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 5px 6px;
    min-height: 58px;
    max-height: 96px;
    margin-top: 10px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: rgba(18, 36, 59, 0.62);
    overflow: auto;
    padding: 6px;
    scrollbar-width: none;
    cursor: text;
  }

  .domain-tags::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  .domain-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid rgba(96, 165, 250, 0.32);
    border-radius: 999px;
    background: rgba(96, 165, 250, 0.12);
    color: #cfe3ff;
    font-size: 12px;
    font-weight: 650;
    line-height: 1;
    padding: 3px 5px 3px 9px;
  }

  .domain-chip button {
    width: 14px;
    height: 14px;
    border: 0;
    border-radius: 999px;
    background: rgba(147, 197, 253, 0.14);
    color: #93c5fd;
    cursor: pointer;
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
    padding: 0;
  }

  .domain-chip button:hover {
    background: rgba(252, 165, 165, 0.18);
    color: var(--danger);
  }

  .domain-tags input,
  .prefix-input,
  .manual-email-input,
  .email-label-input,
  .search-input {
    box-sizing: border-box;
    color: var(--text);
    font: inherit;
  }

  .domain-tags input {
    flex: 1 1 180px;
    min-width: 120px;
    height: 20px;
    border: 0;
    outline: 0;
    background: transparent;
  }

  .prefix-input,
  .manual-email-input,
  .email-label-input,
  .search-input {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 16px;
    outline: 0;
    background: rgba(18, 36, 59, 0.62);
    padding: 12px;
  }

  .search-input {
    max-width: 280px;
    padding: 7px 10px;
  }

  .manual-email-form {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }

  .manual-email-input {
    flex: 1;
    min-width: 0;
  }

  .primary-button,
  .ghost-button,
  .email-label-form button {
    border: 1px solid rgba(96, 165, 250, 0.55);
    border-radius: 999px;
    background: rgba(37, 99, 235, 0.24);
    color: var(--heading);
    cursor: pointer;
    font-weight: 700;
    padding: 9px 14px;
  }

  .primary-button {
    flex: 0 0 auto;
    min-height: 47px;
  }

  .primary-button.small {
    min-height: 0;
    padding: 7px 12px;
    font-size: 12px;
  }

  .primary-button:disabled,
  .ghost-button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .ghost-button {
    background: transparent;
  }

  .ghost-button.small {
    padding: 5px 10px;
    font-size: 12px;
  }

  .primary-button:not(:disabled):hover,
  .email-label-form button:not(:disabled):hover {
    background: rgba(37, 99, 235, 0.36);
    color: var(--heading);
  }

  .ghost-button:not(:disabled):hover,
  .email-label-form .ghost-button:not(:disabled):hover {
    background: rgba(37, 99, 235, 0.14);
    color: var(--heading);
  }

  .random-email-panel {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  .random-email-list {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    margin-top: 10px;
    overflow: auto;
    padding-right: 2px;
    scrollbar-width: none;
  }

  .random-email-list::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  .mx-record-list code::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  .mx-record-list code {
    scrollbar-width: none;
  }

  .random-email-item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: rgba(18, 36, 59, 0.65);
    padding: 12px;
  }

  .random-email-info {
    min-width: 0;
  }

  .random-email-info strong,
  .random-email-info span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .random-email-info strong {
    color: var(--heading);
    font-family: var(--mono);
    font-size: 13px;
  }

  .random-email-label {
    margin: 0 0 5px;
    color: var(--accent-strong);
    font-size: 12px;
    font-weight: 800;
  }

  .random-email-info span {
    margin-top: 4px;
    color: var(--muted);
    font-size: 12px;
  }

  .email-label-form {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  .email-label-input {
    flex: 1;
    min-width: 0;
    padding: 7px 10px;
  }

  .email-label-form button {
    padding: 5px 10px;
    font-size: 12px;
  }

  .label-save-button {
    border-color: rgba(34, 197, 94, 0.42);
    background: rgba(21, 128, 61, 0.28);
    color: #bbf7d0;
  }

  .label-save-button:not(:disabled):hover {
    background: rgba(22, 163, 74, 0.36);
    color: #dcfce7;
  }

  .email-label-form .ghost-button {
    background: transparent;
  }

  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid rgba(96, 165, 250, 0.45);
    border-radius: 50%;
    background: rgba(37, 99, 235, 0.16);
    color: var(--heading);
    cursor: pointer;
    padding: 0;
    transition: all 0.2s ease;
  }

  .icon-button:hover:not(:disabled) {
    background: rgba(37, 99, 235, 0.36);
    border-color: rgba(96, 165, 250, 0.65);
    transform: translateY(-1px);
  }

  .icon-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .icon-button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    border-color: rgba(96, 165, 250, 0.15);
    background: rgba(37, 99, 235, 0.05);
  }

  .icon-button.danger {
    border-color: rgba(252, 165, 165, 0.42);
    background: rgba(127, 29, 29, 0.2);
    color: var(--danger);
  }

  .icon-button.danger:hover:not(:disabled) {
    background: rgba(127, 29, 29, 0.38);
    border-color: rgba(252, 165, 165, 0.65);
    color: #fecaca;
  }

  .icon-button.success {
    border-color: rgba(34, 197, 94, 0.42);
    background: rgba(21, 128, 61, 0.2);
    color: #bbf7d0;
  }

  .icon-button.success:hover:not(:disabled) {
    background: rgba(22, 163, 74, 0.36);
    border-color: rgba(34, 197, 94, 0.65);
    color: #dcfce7;
  }

  .reorder-actions {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: center;
  }

  .reorder-actions .icon-button {
    width: 28px;
    height: 28px;
  }

  .icon-button svg {
    display: block;
    width: 16px;
    height: 16px;
    stroke: currentColor;
    fill: none;
  }

  .reorder-actions .icon-button svg {
    width: 14px;
    height: 14px;
  }

  .settings-alert {
    border: 1px solid rgba(252, 165, 165, 0.35);
    border-radius: 14px;
    background: rgba(127, 29, 29, 0.24);
    color: var(--danger);
    padding: 10px 12px;
  }

  .loading-more {
    padding: 8px 0;
    text-align: center;
  }

  @media (max-width: 620px) {
    .settings-dialog {
      padding: 16px;
    }

    .settings-header {
      align-items: stretch;
      flex-direction: column;
    }

    .settings-header-actions {
      justify-content: flex-start;
      flex-wrap: wrap;
    }

    .random-email-item {
      grid-template-columns: auto minmax(0, 1fr);
      gap: 8px 12px;
    }

    .reorder-actions {
      grid-row: span 2;
      align-self: center;
    }

    .random-email-info {
      grid-column: 2;
    }

    .random-email-actions {
      grid-column: 2;
      justify-content: flex-start;
      gap: 8px;
    }

    .random-email-panel .settings-box-heading {
      align-items: stretch;
      flex-wrap: wrap;
    }

    .random-email-panel .settings-box-heading h3 {
      flex: 1 0 100%;
    }

    .search-input {
      flex: 1 1 0;
      max-width: none;
      min-width: 0;
    }

    .manual-email-form {
      align-items: stretch;
      flex-direction: column;
    }

    .email-label-form {
      align-items: stretch;
      flex-direction: column;
    }

    .email-label-form button {
      width: 100%;
    }
  }
</style>
