<script lang="ts">
  import type { FrontendOpenForgeAPI, OpenForgeContextSnapshot } from '@openforge-app/plugin-sdk/frontend'
  import {
    readAiSettings,
    resolveProvider,
    writeAnthropicKey,
    writeGroqKey,
    writePreferredProvider,
    DEFAULT_PROVIDER,
  } from '../lib/settings/aiSettings'
  import type { AiProvider } from '../lib/settings/aiSettings'

  interface Props {
    api: FrontendOpenForgeAPI
    context: OpenForgeContextSnapshot
  }

  let { api }: Props = $props()

  let anthropicKey = $state('')
  let groqKey = $state('')
  let preferred = $state<AiProvider>(DEFAULT_PROVIDER)
  // What's actually in storage, so a blur that changed nothing doesn't write.
  let savedAnthropic = $state('')
  let savedGroq = $state('')
  let loaded = $state(false)
  let error = $state<string | null>(null)

  void (async () => {
    const settings = await readAiSettings(api.storage)
    anthropicKey = settings.anthropicKey
    groqKey = settings.groqKey
    preferred = settings.preferred
    savedAnthropic = settings.anthropicKey
    savedGroq = settings.groqKey
    loaded = true
  })()

  // Which provider a Refine would actually use right now, so the choice below can say
  // when a preference isn't being honoured rather than leaving the user to guess.
  let active = $derived(resolveProvider({ anthropicKey, groqKey, preferred }))
  let bothPresent = $derived(Boolean(anthropicKey && groqKey))

  // Every control stays disabled until the stored settings land, so a write can only
  // be triggered against values the user has actually seen.
  async function persist(write: () => Promise<void>, commit: () => void) {
    if (!loaded) return
    error = null
    try {
      await write()
      commit()
    } catch (e) {
      error = String(e instanceof Error ? e.message : e)
    }
  }

  function persistAnthropic() {
    const next = anthropicKey.trim()
    if (next === savedAnthropic) return
    void persist(
      () => writeAnthropicKey(api.storage, next),
      () => {
        savedAnthropic = next
        anthropicKey = next
      },
    )
  }

  function persistGroq() {
    const next = groqKey.trim()
    if (next === savedGroq) return
    void persist(
      () => writeGroqKey(api.storage, next),
      () => {
        savedGroq = next
        groqKey = next
      },
    )
  }

  function choose(provider: AiProvider) {
    if (provider === preferred) return
    preferred = provider
    void persist(() => writePreferredProvider(api.storage, provider), () => {})
  }
</script>

<div class="flex flex-col gap-4 p-2">
  <p class="text-xs text-base-content/60 m-0">
    A key here enables <span class="font-semibold">Refine</span> on the issues board, which drafts a ticket from a
    rough note. Either provider works — add whichever you have. Keys are shared across all projects and stored on
    this machine only.
  </p>

  <div class="flex flex-col gap-2">
    <label class="text-xs font-semibold text-base-content/60 uppercase tracking-wide" for="issues-anthropic-key">
      Anthropic API key
    </label>
    <input
      id="issues-anthropic-key"
      class="input input-bordered input-sm w-full"
      type="password"
      autocomplete="off"
      spellcheck="false"
      placeholder="sk-ant-…"
      disabled={!loaded}
      bind:value={anthropicKey}
      onblur={persistAnthropic}
    />
  </div>

  <div class="flex flex-col gap-2">
    <label class="text-xs font-semibold text-base-content/60 uppercase tracking-wide" for="issues-groq-key">
      Groq API key
    </label>
    <input
      id="issues-groq-key"
      class="input input-bordered input-sm w-full"
      type="password"
      autocomplete="off"
      spellcheck="false"
      placeholder="gsk_…"
      disabled={!loaded}
      bind:value={groqKey}
      onblur={persistGroq}
    />
  </div>

  <fieldset class="flex flex-col gap-2">
    <legend class="text-xs font-semibold text-base-content/60 uppercase tracking-wide">Use for Refine</legend>
    <div class="flex gap-4">
      <label class="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="radio"
          class="radio radio-sm"
          name="issues-ai-provider"
          value="anthropic"
          disabled={!loaded}
          checked={preferred === 'anthropic'}
          onchange={() => choose('anthropic')}
        />
        Anthropic
      </label>
      <label class="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="radio"
          class="radio radio-sm"
          name="issues-ai-provider"
          value="groq"
          disabled={!loaded}
          checked={preferred === 'groq'}
          onchange={() => choose('groq')}
        />
        Groq
      </label>
    </div>

    {#if active === null}
      <p class="text-xs text-base-content/60 m-0">
        Add a key above to enable Refine. Until then this choice has no effect.
      </p>
    {:else if active !== preferred}
      <p class="text-xs text-warning m-0">
        Using {active === 'groq' ? 'Groq' : 'Anthropic'} instead — the preferred provider has no key yet.
      </p>
    {:else if !bothPresent}
      <p class="text-xs text-base-content/60 m-0">
        Only matters once both keys are set; with one key, Refine uses that provider.
      </p>
    {/if}
  </fieldset>

  {#if error}
    <p class="alert alert-error text-sm m-0" role="alert">{error}</p>
  {/if}
</div>
