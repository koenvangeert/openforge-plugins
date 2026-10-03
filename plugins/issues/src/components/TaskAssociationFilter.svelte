<script lang="ts">
  import type { TaskAssociationMode } from '../lib/taskAssociation'

  interface Props {
    mode: TaskAssociationMode
    onChange: (mode: TaskAssociationMode) => void
  }

  let { mode, onChange }: Props = $props()

  const options: { mode: TaskAssociationMode; text: string; label: string }[] = [
    { mode: 'all', text: 'All', label: 'All issues' },
    { mode: 'without', text: 'No task', label: 'Issues without an OpenForge task' },
    { mode: 'with', text: 'Has task', label: 'Issues with an OpenForge task' },
  ]
</script>

<div class="join shrink-0" role="radiogroup" aria-label="Filter issues by OpenForge task">
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
