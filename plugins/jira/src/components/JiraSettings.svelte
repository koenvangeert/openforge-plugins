<script lang="ts">
  import { onMount } from 'svelte'
  import type { PluginSettingsSectionProps } from '@openforge-app/plugin-sdk/frontend'
  import type { JsonValue } from '@openforge-app/plugin-sdk'
  import { buildCredentialsToStore } from '../lib/settingsForm'
  import type { TestConnectionResult } from '../lib/jiraTypes'
  import { GLOBAL_KEY, METHOD } from '../lib/protocol'

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
      const raw = await api.storage.global.get(GLOBAL_KEY.credentials)
      if (raw && typeof raw === 'object') {
        const record = raw as Record<string, unknown>
        site = typeof record.site === 'string' ? record.site : ''
        email = typeof record.email === 'string' ? record.email : ''
        hasStoredToken = typeof record.apiToken === 'string' && record.apiToken.length > 0
      }
    })()
  })

  async function save() {
    status = null

    // Only pull the stored token back into the renderer when the field is left
    // blank ("keep existing"); otherwise the token never re-enters renderer memory.
    let existingToken: string | null = null
    if (apiToken.trim().length === 0 && hasStoredToken) {
      const existing = await api.storage.global.get(GLOBAL_KEY.credentials)
      if (existing && typeof existing === 'object' && typeof (existing as Record<string, unknown>).apiToken === 'string') {
        existingToken = (existing as Record<string, unknown>).apiToken as string
      }
    }

    const result = buildCredentialsToStore({ site, email, apiToken }, existingToken)
    if (!result.ok) {
      status = { kind: 'error', message: result.message }
      return
    }

    await api.storage.global.set(GLOBAL_KEY.credentials, result.credentials as unknown as JsonValue)
    site = result.credentials.site
    apiToken = ''
    hasStoredToken = true
    status = { kind: 'saved', message: 'Saved.' }
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
