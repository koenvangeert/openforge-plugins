<script lang="ts">
  import { onMount } from 'svelte'
  import type { PluginSettingsSectionProps } from '@openforge-app/plugin-sdk/frontend'
  import {
    DEFAULT_RESCAN_MINUTES,
    MAX_RESCAN_MINUTES,
    MIN_RESCAN_MINUTES,
    readRescanMinutes,
    writeRescanMinutes,
  } from './rescanInterval'

  let { api }: PluginSettingsSectionProps = $props()

  let minutes = $state(DEFAULT_RESCAN_MINUTES)
  let saved = $state(false)

  onMount(() => {
    void readRescanMinutes(api.storage.global).then((stored) => {
      minutes = stored
    })
  })

  async function save(): Promise<void> {
    minutes = await writeRescanMinutes(api.storage.global, minutes)
    saved = true
  }
</script>

<section class="flex max-w-md flex-col gap-3 p-4">
  <label class="flex flex-col gap-1">
    <span class="text-xs font-medium text-base-content/70">Rescan transcripts every</span>
    <div class="flex items-center gap-2">
      <input
        class="input input-bordered input-sm w-24"
        type="number"
        min={MIN_RESCAN_MINUTES}
        max={MAX_RESCAN_MINUTES}
        step="1"
        bind:value={minutes}
        oninput={() => (saved = false)}
      />
      <span class="text-sm text-base-content/60">minutes</span>
      <button class="btn btn-primary btn-sm" onclick={() => void save()}>Save</button>
    </div>
  </label>

  <p class="m-0 text-xs text-base-content/55">
    A full scan of every transcript takes about a second and only re-reads files whose size or
    modification time changed. The new interval applies after the current one elapses.
  </p>

  {#if saved}
    <div class="alert alert-success py-2 text-sm">Rescanning every {minutes} minutes.</div>
  {/if}
</section>
