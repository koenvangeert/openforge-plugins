<script lang="ts">
  import { onMount } from 'svelte'
  import type { PluginSettingsSectionProps } from '@openforge-app/plugin-sdk/frontend'
  import type { JiraSettingsSnapshot, SaveSettingsResult } from '../lib/settingsForm'
  import type { TestConnectionResult } from '../lib/jiraTypes'
  import { METHOD } from '../lib/protocol'

  let { api }: PluginSettingsSectionProps = $props()

  let site = $state('')
  let email = $state('')
  // Left blank on load so the stored token is never re-rendered into the DOM;
  // an empty token field on save means "keep the existing token".
  let apiToken = $state('')
  let hasStoredToken = $state(false)
  let status = $state<{ kind: 'ok' | 'error' | 'saved'; message: string } | null>(null)
  let testing = $state(false)

  onMount(() => {
    void (async () => {
      try {
        await api.backend.whenReady()
        const settings = await api.backend.invoke<JiraSettingsSnapshot>(METHOD.getSettings)
        site = settings.site
        email = settings.email
        hasStoredToken = settings.hasStoredToken
      } catch (error) {
        status = { kind: 'error', message: error instanceof Error ? error.message : 'Could not load Jira settings.' }
      }
    })()
  })

  async function save() {
    status = null

    try {
      await api.backend.whenReady()
      const result = await api.backend.invoke<SaveSettingsResult>(METHOD.saveSettings, { site, email, apiToken })
      if (!result.ok) {
        status = { kind: 'error', message: result.message }
        return
      }

      site = result.settings.site
      email = result.settings.email
      apiToken = ''
      hasStoredToken = result.settings.hasStoredToken
      status = { kind: 'saved', message: 'Saved.' }
    } catch (error) {
      status = { kind: 'error', message: error instanceof Error ? error.message : 'Could not save Jira settings.' }
    }
  }

  async function test() {
    testing = true
    status = null
    try {
      await api.backend.whenReady()
      const result = await api.backend.invoke<TestConnectionResult>(METHOD.testConnection)
      status = result.ok
        ? { kind: 'ok', message: `Connected as ${result.displayName}.` }
        : { kind: 'error', message: result.message }
    } catch (error) {
      status = { kind: 'error', message: error instanceof Error ? error.message : 'Test failed.' }
    } finally {
      testing = false
    }
  }
</script>

<section class="flex flex-col gap-4 p-4 max-w-md">
  <p class="text-xs text-base-content/60 leading-relaxed">
    Credentials are stored in plugin storage as plaintext on disk (see ADR 0002). All Jira
    requests are made from the plugin backend, never the renderer.
  </p>

  <label class="flex flex-col gap-1">
    <span class="text-xs font-medium text-base-content/70">Site</span>
    <input class="input input-bordered input-sm w-full" type="text" placeholder="acme.atlassian.net" bind:value={site} />
  </label>

  <label class="flex flex-col gap-1">
    <span class="text-xs font-medium text-base-content/70">Email</span>
    <input class="input input-bordered input-sm w-full" type="email" placeholder="you@acme.com" bind:value={email} />
  </label>

  <label class="flex flex-col gap-1">
    <span class="text-xs font-medium text-base-content/70">API token</span>
    <input
      class="input input-bordered input-sm w-full"
      type="password"
      placeholder={hasStoredToken ? '•••••••• (leave blank to keep)' : 'Create at id.atlassian.com'}
      bind:value={apiToken}
    />
  </label>

  <div class="flex items-center gap-2">
    <button class="btn btn-primary btn-sm" onclick={() => void save()}>Save</button>
    <button class="btn btn-ghost btn-sm" onclick={() => void test()} disabled={testing}>
      {#if testing}<span class="loading loading-spinner loading-xs"></span>{/if}
      {testing ? 'Testing…' : 'Test connection'}
    </button>
  </div>

  {#if status}
    {#if status.kind === 'error'}
      <div class="alert alert-error text-sm py-2">{status.message}</div>
    {:else}
      <div class="alert alert-success text-sm py-2">{status.message}</div>
    {/if}
  {/if}
</section>
