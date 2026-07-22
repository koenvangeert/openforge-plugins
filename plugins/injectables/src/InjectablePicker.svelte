<script lang="ts">
  import Modal from '@openforge-app/plugin-sdk/ui/Modal.svelte'
  import InjectableBrowser from './InjectableBrowser.svelte'
  import type { Injectable } from './lib/injectableDomain'
  import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'

  interface Props {
    api: FrontendOpenForgeAPI
    projectId: string | null
    open: boolean
    onClose: () => void
    onSelect: (injectable: Injectable) => void
  }
  let { api, projectId, open, onClose, onSelect }: Props = $props()

  // The shared browser (list + detail + keyboard model) is the same component the
  // Injectables rail view renders; this picker only adds the modal shell, the insert
  // action, and the keyboard hints.
  let browser = $state<ReturnType<typeof InjectableBrowser> | null>(null)

  let prevOpen = false
  $effect(() => {
    // Each summon starts fresh: reload the catalog, nothing selected, preview closed.
    if (open && !prevOpen) browser?.reset()
    prevOpen = open
  })

  function insert(injectable: Injectable) {
    onSelect(injectable)
    onClose()
  }

  // Render the picker's overlay at <body> instead of inline. The trigger lives inside a
  // host dialog whose daisyUI `.modal-box` sets `translate`/`scale` — those establish a
  // containing block, so a nested `position: fixed` overlay is scoped to (and clipped by)
  // that box instead of the viewport. Moving the node to <body> escapes it. Safe in
  // Svelte 5: it attaches delegated listeners to `document` as well as the mount root
  // specifically so manually-portaled nodes keep receiving clicks/keys.
  function portalToBody(node: HTMLElement) {
    document.body.appendChild(node)
    return {
      destroy() {
        node.remove()
      },
    }
  }
</script>

{#snippet detailFooter(selected: Injectable)}
  <button class="btn btn-primary btn-sm" onclick={() => insert(selected)} type="button">
    Insert into prompt
  </button>
  {#if selected.kind === 'snippet'}
    <span class="text-xs opacity-60">Inserts the snippet text — you review before sending</span>
  {:else}
    <span class="text-xs opacity-60">Inserts <code>{selected.invocationText}</code> — you review before sending</span>
  {/if}
{/snippet}

{#if open}
  <div use:portalToBody style="display: contents">
  <Modal
    {onClose}
    onKeydown={(e: KeyboardEvent) => browser?.handleKeydown(e)}
    ariaLabel="Injectable picker"
    maxWidth="90vw"
    boxClass="w-[90vw] h-[85vh]"
    initialFocus="input">
    {#snippet header()}
      <div class="flex items-center gap-3">
        <h2 class="text-base font-semibold">Injectables</h2>
        <span class="text-xs opacity-60">Browse, read &amp; insert skills, commands &amp; snippets</span>
      </div>
    {/snippet}

    <InjectableBrowser
      bind:this={browser}
      {api}
      {projectId}
      onActivate={insert}
      onEscape={onClose}
      {detailFooter} />

    <!-- Footer: keyboard hints -->
    <div class="flex items-center gap-4 border-t border-base-300 px-5 py-2 text-xs opacity-60">
      <span class="flex items-center gap-1"><kbd class="kbd kbd-xs">↑</kbd><kbd class="kbd kbd-xs">↓</kbd> move</span>
      <span class="flex items-center gap-1"><kbd class="kbd kbd-xs">↵</kbd> insert</span>
      <span class="flex items-center gap-1"><kbd class="kbd kbd-xs">esc</kbd> close</span>
    </div>
  </Modal>
  </div>
{/if}
