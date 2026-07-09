<script lang="ts">
  // oxlint-disable-next-line no-unassigned-vars
  export let title = ''
  // oxlint-disable-next-line no-unassigned-vars
  export let message = ''
  // oxlint-disable-next-line no-unassigned-vars
  export let confirmLabel = 'Delete'
  // oxlint-disable-next-line no-unassigned-vars
  export let cancelLabel = 'Cancel'
  // oxlint-disable-next-line no-unassigned-vars
  export let confirm: () => void
  // oxlint-disable-next-line no-unassigned-vars
  export let close: () => void

  function closeOnBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) close()
  }
</script>

<svelte:window on:keydown={(event) => event.key === 'Escape' && close()} />

<div class="confirm-backdrop" role="presentation" on:click={closeOnBackdrop}>
  <dialog class="confirm-dialog" aria-modal="true" aria-label={title} open>
    <h2>{title}</h2>
    <p>{message}</p>
    <div class="confirm-actions">
      <button type="button" class="ghost-button" on:click={close}>{cancelLabel}</button>
      <button type="button" class="danger-button" on:click={confirm}>{confirmLabel}</button>
    </div>
  </dialog>
</div>

<style>
  .confirm-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    background: rgba(3, 7, 18, 0.72);
    padding: 16px;
    box-sizing: border-box;
  }

  .confirm-dialog {
    box-sizing: border-box;
    width: min(420px, 100%);
    max-width: 100%;
    margin: 0;
    border: 1px solid var(--line);
    border-radius: 22px;
    background: rgba(14, 26, 43, 0.98);
    box-shadow: var(--shadow);
    color: var(--text);
    padding: 18px;
  }

  .confirm-dialog h2 {
    margin: 0;
    color: var(--heading);
    font-size: 18px;
  }

  .confirm-dialog p {
    margin: 10px 0 0;
    color: var(--muted);
    font-size: 14px;
    word-break: break-word;
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 18px;
  }

  .ghost-button,
  .danger-button {
    border: 1px solid rgba(96, 165, 250, 0.55);
    border-radius: 999px;
    background: rgba(37, 99, 235, 0.24);
    color: var(--heading);
    cursor: pointer;
    font-weight: 700;
    padding: 8px 14px;
  }

  .ghost-button {
    background: transparent;
  }

  .danger-button {
    border-color: rgba(252, 165, 165, 0.42);
    background: rgba(127, 29, 29, 0.24);
    color: var(--danger);
  }

  @media (max-width: 420px) {
    .confirm-backdrop {
      padding: 12px;
    }

    .confirm-dialog {
      padding: 16px;
    }

    .confirm-actions {
      align-items: stretch;
      flex-direction: column-reverse;
    }
  }
</style>
