<script lang="ts">
  import type { PluginSettingsSectionProps } from '@openforge-app/plugin-sdk/frontend'
  import {
    DEFAULT_HANDOFF_NOTES_TEMPLATE,
    loadHandoffNotesSettings,
    resetHandoffNotesSettings,
    saveHandoffNotesSettings,
    validateHandoffNotesTemplate,
  } from './handoffNotesSettings'

  interface Props extends PluginSettingsSectionProps {}
  let { api, context }: Props = $props()

  let projectId = $derived(context.projectId)
  let template = $state(DEFAULT_HANDOFF_NOTES_TEMPLATE)
  let loading = $state(true)
  let saving = $state(false)
  let configurationIssue = $state<string | null>(null)
  let requestIssue = $state<string | null>(null)
  let savedMessage = $state<string | null>(null)
  let validationIssue = $derived(validateHandoffNotesTemplate(template))
  let canSave = $derived(Boolean(projectId) && !loading && !saving && !configurationIssue && !validationIssue)

  $effect(() => {
    const currentProjectId = projectId
    let active = true
    template = DEFAULT_HANDOFF_NOTES_TEMPLATE
    configurationIssue = null
    requestIssue = null
    savedMessage = null
    loading = Boolean(currentProjectId)
    saving = false

    if (currentProjectId) {
      void loadHandoffNotesSettings(api.tasks, currentProjectId)
        .then((settings) => {
          if (!active) return
          template = settings.template
          configurationIssue = settings.issue
        })
        .catch((error: unknown) => {
          if (!active) return
          requestIssue = error instanceof Error ? error.message : 'Unable to load workflow settings.'
        })
        .finally(() => {
          if (active) loading = false
        })
    }

    return () => { active = false }
  })

  async function save(): Promise<void> {
    const currentProjectId = projectId
    if (!currentProjectId || !canSave) return
    saving = true
    requestIssue = null
    savedMessage = null
    try {
      await saveHandoffNotesSettings(api.tasks, currentProjectId, { template })
      if (projectId !== currentProjectId) return
      template = template.trim() || DEFAULT_HANDOFF_NOTES_TEMPLATE
      savedMessage = 'Handoff Notes Workflow settings saved.'
    } catch (error: unknown) {
      if (projectId === currentProjectId) {
        requestIssue = error instanceof Error ? error.message : 'Unable to save workflow settings.'
      }
    } finally {
      if (projectId === currentProjectId) saving = false
    }
  }

  async function reset(): Promise<void> {
    const currentProjectId = projectId
    if (!currentProjectId || loading || saving) return
    saving = true
    requestIssue = null
    savedMessage = null
    try {
      await resetHandoffNotesSettings(api.tasks, currentProjectId)
      if (projectId !== currentProjectId) return
      template = DEFAULT_HANDOFF_NOTES_TEMPLATE
      configurationIssue = null
      savedMessage = 'Default Handoff Notes template restored.'
    } catch (error: unknown) {
      if (projectId === currentProjectId) {
        requestIssue = error instanceof Error ? error.message : 'Unable to reset the workflow template.'
      }
    } finally {
      if (projectId === currentProjectId) saving = false
    }
  }
</script>

<section class="handoff-settings" aria-labelledby="handoff-settings-title">
  <div class="heading">
    <h3 id="handoff-settings-title">Workflow configuration</h3>
    <p>
      The workflow is active whenever this plugin is enabled for the project. Customize the template
      below or leave it blank to use the default.
    </p>
  </div>

  {#if !projectId}
    <p class="message error" role="alert">Select a project to configure its Handoff Notes Workflow.</p>
  {:else if loading}
    <p class="message" aria-live="polite">Loading project settings…</p>
  {:else}
    <label class="template-field">
      <span>Handoff Notes template</span>
      <textarea
        bind:value={template}
        rows="13"
        disabled={saving}
        aria-invalid={Boolean(configurationIssue || validationIssue)}
        aria-describedby={configurationIssue || validationIssue ? 'template-help template-error' : 'template-help'}
      ></textarea>
    </label>
    <p id="template-help" class="hint">
      Markdown is supported. The agent uses these sections once the implementation is complete.
    </p>

    {#if configurationIssue || validationIssue}
      <p id="template-error" class="message error" role="alert">
        {configurationIssue ?? validationIssue}
      </p>
    {/if}

    <div class="actions">
      <button type="button" class="primary" onclick={save} disabled={!canSave}>
        {saving ? 'Saving…' : 'Save settings'}
      </button>
      <button type="button" onclick={reset} disabled={saving}>Reset to default</button>
    </div>

    {#if requestIssue}
      <p class="message error" role="alert">{requestIssue}</p>
    {:else if savedMessage}
      <p class="message success" aria-live="polite">{savedMessage}</p>
    {/if}
  {/if}
</section>

<style>
  .handoff-settings,
  .heading,
  .template-field {
    display: flex;
    flex-direction: column;
  }

  .handoff-settings {
    gap: 1rem;
  }

  .heading,
  .template-field {
    gap: 0.35rem;
  }

  h3,
  p {
    margin: 0;
  }

  .hint {
    font-size: 0.82rem;
    opacity: 0.72;
  }

  .template-field > span {
    font-weight: 650;
  }

  textarea {
    background: color-mix(in srgb, currentColor 4%, transparent);
    border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
    border-radius: 0.5rem;
    color: inherit;
    font: 0.88rem/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    padding: 0.75rem;
    resize: vertical;
  }

  textarea[aria-invalid="true"] {
    border-color: currentColor;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
  }

  button {
    background: transparent;
    border: 1px solid color-mix(in srgb, currentColor 28%, transparent);
    border-radius: 0.45rem;
    color: inherit;
    cursor: pointer;
    padding: 0.5rem 0.8rem;
  }

  button.primary {
    background: currentColor;
    color: Canvas;
  }

  button:disabled,
  textarea:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .message {
    border-radius: 0.4rem;
    padding: 0.6rem 0.75rem;
  }

  .error {
    background: color-mix(in srgb, #d33 12%, transparent);
  }

  .success {
    background: color-mix(in srgb, #198754 13%, transparent);
  }
</style>
