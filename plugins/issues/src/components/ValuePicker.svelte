<script lang="ts">
  interface Props {
    current: number | null
    onPick: (value: number | null) => void
    onClose: () => void
  }

  let { current, onPick, onClose }: Props = $props()

  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose()
  }
</script>

<svelte:window onkeydown={handleKeydown} />
<div class="fixed inset-0 z-40" role="presentation" onclick={onClose}></div>
<div
  class="absolute right-0 top-[calc(100%+0.375rem)] z-50 grid grid-cols-5 gap-1 rounded-box border border-base-300 bg-base-100 p-2 shadow-xl"
  role="listbox"
  tabindex="-1"
  aria-label="Set value"
>
  {#each values as n}
    <button
      type="button"
      role="option"
      aria-selected={current === n}
      aria-label={`Set value ${n}`}
      class="btn btn-xs {current === n ? 'btn-primary' : 'btn-outline'}"
      onclick={() => onPick(n)}
    >{n}</button>
  {/each}
  <button type="button" class="btn btn-xs btn-ghost col-span-5" onclick={() => onPick(null)}>Clear</button>
</div>
