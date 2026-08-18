<script lang="ts">
  import { X } from '@lucide/svelte'

  interface Props {
    value: string
    matchCount: number
    totalCount: number
    active: boolean
    /** Exposes the underlying input so IssuesView can focus it for the `/` hotkey. */
    inputEl?: HTMLInputElement | null
  }

  let {
    value = $bindable(''),
    matchCount,
    totalCount,
    active,
    inputEl = $bindable(null),
  }: Props = $props()

  function clear(): void {
    value = ''
  }
</script>

<div class="flex items-center gap-2 shrink-0">
  <div class="relative">
    <input
      bind:this={inputEl}
      bind:value
      type="search"
      class="input input-bordered input-sm w-48"
      placeholder="Search issues…"
      aria-label="Search issues"
    />
    {#if value}
      <button
        type="button"
        class="btn btn-ghost btn-xs btn-square absolute right-1 top-1/2 -translate-y-1/2"
        aria-label="Clear search"
        onclick={clear}
      >
        <X size={12} />
      </button>
    {/if}
  </div>
  {#if active}
    <span class="text-xs text-base-content/60 whitespace-nowrap">{matchCount} of {totalCount}</span>
  {/if}
</div>
