<script lang="ts">
  import { X } from '@lucide/svelte'

  interface Props {
    selectedValues: Set<number | 'none'>
    onToggleValue: (value: number | 'none') => void
    onClear: () => void
  }

  let { selectedValues, onToggleValue, onClear }: Props = $props()

  const valueOptions: (number | 'none')[] = [
    'none',
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
  ]

  function handleClick(value: number | 'none') {
    onToggleValue(value)
  }

  function handleClear() {
    onClear()
  }

  function isSelected(value: number | 'none'): boolean {
    return selectedValues.has(value)
  }
</script>

<div class="flex items-center gap-1.5 flex-wrap">
  {#if selectedValues.size > 0}
    <button
      type="button"
      class="btn btn-ghost btn-xs btn-square"
      aria-label="Clear value filter"
      onclick={handleClear}
      title="Clear all filters"
    >
      <X size={14} />
    </button>
  {/if}
  {#each valueOptions as value}
    <button
      type="button"
      class="btn btn-xs {isSelected(value) ? 'btn-primary' : 'btn-outline'}"
      onclick={() => handleClick(value)}
      aria-label={value === 'none' ? 'Filter by no value' : `Filter by value ${value}`}
      aria-pressed={isSelected(value)}
    >
      {value === 'none' ? 'No value' : value}
    </button>
  {/each}
</div>
