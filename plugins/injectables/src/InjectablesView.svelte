<script lang="ts">
  import type { FrontendOpenForgeAPI, OpenForgeContextSnapshot } from '@openforge-app/plugin-sdk/frontend'
  import PluginPageHeader from '@openforge-app/plugin-sdk/ui/PluginPageHeader.svelte'
  import InjectableBrowser from './InjectableBrowser.svelte'
  import type { Injectable } from './lib/injectableDomain'

  interface Props {
    api: FrontendOpenForgeAPI
    context: OpenForgeContextSnapshot
    projectName: string
    projectId?: string | null
  }

  let { api, context: _context, projectName, projectId = null }: Props = $props()

  // The same browser the picker renders, so the two surfaces cannot drift apart. The
  // view supplies page chrome and a copy action where the picker supplies a modal
  // shell and an insert action.
  let browser = $state<ReturnType<typeof InjectableBrowser> | null>(null)
  let copied = $state(false)
  let copyError = $state<string | null>(null)

  async function copySelected(selected: Injectable) {
    try {
      await navigator.clipboard.writeText(selected.invocationText)
      copyError = null
      copied = true
      setTimeout(() => {
        copied = false
      }, 1500)
    } catch (e) {
      copyError = `Copy failed: ${e instanceof Error ? e.message : String(e)}`
    }
  }
</script>

{#snippet detailFooter(selected: Injectable)}
  <button
    data-testid="copy-injectable"
    class="btn btn-primary btn-sm"
    onclick={() => void copySelected(selected)}
    type="button">{copied ? 'Copied' : 'Copy'}</button>
  {#if selected.kind === 'snippet'}
    <span class="text-xs opacity-60">Copies the snippet text to the clipboard</span>
  {:else}
    <span class="text-xs opacity-60">Copies <code>{selected.invocationText}</code> to the clipboard</span>
  {/if}
  {#if copyError}
    <span class="text-xs text-error">{copyError}</span>
  {/if}
{/snippet}

<div class="flex h-full flex-col overflow-hidden">
  <PluginPageHeader
    title={projectName ? `${projectName} — Injectables` : 'Injectables'}
    subtitle={projectId
      ? 'Skills, commands, and personal snippets'
      : 'Select a project to load its skills and commands — snippets are always available'}
  >
    {#snippet actions()}
      <button class="btn btn-sm border border-base-300" onclick={() => browser?.reset()} type="button">
        ↻ Refresh
      </button>
    {/snippet}
  </PluginPageHeader>

  <!-- The browser owns the keyboard model; the page routes bubbled keys into it. -->
  <div class="flex min-h-0 flex-1 flex-col" onkeydown={(e) => browser?.handleKeydown(e)} role="presentation">
    <InjectableBrowser
      bind:this={browser}
      {api}
      {projectId}
      onActivate={null}
      onEscape={null}
      autoSelectFirst
      mode="manage"
      {detailFooter} />
  </div>
</div>
