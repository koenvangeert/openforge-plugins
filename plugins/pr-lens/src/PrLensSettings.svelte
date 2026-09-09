<script lang="ts">
  import type { PluginSettingsSectionProps } from '@openforge-app/plugin-sdk/frontend'
  import Button from '@openforge-app/plugin-sdk/ui/Button.svelte'
  import { DEFAULT_PROMPT_TEMPLATE, loadPromptTemplate, savePromptTemplate } from './prLensTemplate'

  interface Props extends PluginSettingsSectionProps {}
  let { api, context }: Props = $props()

  let projectId = $derived(context.projectId)
  let template = $state(DEFAULT_PROMPT_TEMPLATE)
  let loading = $state(true)
  let saving = $state(false)
  let requestIssue = $state<string | null>(null)
  let savedMessage = $state<string | null>(null)

  $effect(() => {
    const currentProjectId = projectId
    let active = true
    template = DEFAULT_PROMPT_TEMPLATE
    requestIssue = null
    savedMessage = null
    loading = Boolean(currentProjectId)
    saving = false

    if (currentProjectId) {
      void loadPromptTemplate(api.storage, currentProjectId)
        .then((stored) => { if (active) template = stored })
        .catch((error: unknown) => {
          if (active) requestIssue = error instanceof Error ? error.message : 'Unable to load the prompt.'
        })
        .finally(() => { if (active) loading = false })
    }

    return () => { active = false }
  })

  async function save(): Promise<void> {
    const currentProjectId = projectId
    if (!currentProjectId || loading || saving) return
    saving = true
    requestIssue = null
    savedMessage = null
    try {
      const stored = await savePromptTemplate(api.storage, currentProjectId, template)
      if (projectId !== currentProjectId) return
      const restored = stored === DEFAULT_PROMPT_TEMPLATE && template.trim() !== DEFAULT_PROMPT_TEMPLATE
      template = stored
      savedMessage = restored ? 'Default PR Lens prompt restored.' : 'PR Lens prompt saved.'
    } catch (error: unknown) {
      if (projectId === currentProjectId) {
        requestIssue = error instanceof Error ? error.message : 'Unable to save the prompt.'
      }
    } finally {
      if (projectId === currentProjectId) saving = false
    }
  }
</script>

<section class="pr-lens-settings" aria-labelledby="pr-lens-settings-title">
  <div class="heading">
    <h3 id="pr-lens-settings-title">Diagram prompt</h3>
    <p>
      Sent to the agent when you request a diagram. The default needs nothing installed. If you
      have the PR Lens agent skill on this machine, shorten it to invoke that instead. Save it
      blank to restore the default.
    </p>
  </div>

  {#if !projectId}
    <p class="message error" role="alert">Select a project to configure its PR Lens prompt.</p>
  {:else if loading}
    <p class="message" aria-live="polite">Loading project prompt…</p>
  {:else}
    <label class="template-field">
      <span>Prompt</span>
      <textarea bind:value={template} rows="16" disabled={saving}></textarea>
    </label>

    <div class="actions">
      <Button variant="primary" size="sm" onclick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save prompt'}
      </Button>
    </div>

    {#if requestIssue}
      <p class="message error" role="alert">{requestIssue}</p>
    {:else if savedMessage}
      <p class="message success" aria-live="polite">{savedMessage}</p>
    {/if}
  {/if}
</section>

<style>
  .pr-lens-settings,
  .heading,
  .template-field {
    display: flex;
    flex-direction: column;
  }

  .pr-lens-settings {
    color: var(--of-text);
    font-family: var(--of-font-sans);
    gap: var(--of-space3);
  }

  .heading,
  .template-field {
    gap: var(--of-space1);
  }

  h3,
  p {
    margin: 0;
  }

  .heading > p {
    color: var(--of-text-muted);
    font-size: var(--of-text-sm);
  }

  .template-field > span {
    font-size: var(--of-text-sm);
    font-weight: var(--of-weight-medium);
  }

  textarea {
    background: var(--of-field);
    border: var(--of-border-width) solid var(--of-border);
    border-radius: var(--of-radius-control);
    color: var(--of-text);
    font: var(--of-text-sm) / var(--of-line-height-sm) ui-monospace, SFMono-Regular, Menlo, Monaco,
      Consolas, monospace;
    padding: var(--of-space2);
    resize: vertical;
  }

  textarea:disabled {
    background: var(--of-control-disabled);
    color: var(--of-control-text-disabled);
    cursor: not-allowed;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--of-space2);
  }

  .message {
    background: var(--of-surface-subtle);
    border-radius: var(--of-radius-container);
    color: var(--of-text-secondary);
    padding: var(--of-space2) var(--of-space3);
  }

  .error {
    background: var(--of-danger-subtle);
    color: var(--of-text);
  }

  .success {
    background: var(--of-success-subtle);
    color: var(--of-text);
  }
</style>
