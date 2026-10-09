<script lang="ts">
  import type { DependencyMode } from '../lib/dependency'

  interface Props {
    mode: DependencyMode
    onChange: (mode: DependencyMode) => void
  }

  let { mode, onChange }: Props = $props()

  const options: { mode: DependencyMode; text: string; label: string }[] = [
    { mode: 'all', text: 'All', label: 'Show all issues' },
    { mode: 'blocked', text: 'Blocked', label: 'Show blocked issues' },
    { mode: 'blocking', text: 'Blocking', label: 'Show blocking issues' },
    { mode: 'unblocked', text: 'Unblocked', label: 'Show issues that are not blocked' },
  ]
</script>

<div class="join shrink-0" role="radiogroup" aria-label="Filter issues by dependency">
  {#each options as option (option.mode)}
    <button
      type="button"
      role="radio"
      class="btn btn-sm join-item {mode === option.mode ? 'btn-primary' : ''}"
      aria-checked={mode === option.mode}
      aria-label={option.label}
      title={option.label}
      onclick={() => onChange(option.mode)}
    >
      {option.text}
    </button>
  {/each}
</div>
