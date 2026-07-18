<script lang="ts">
  interface Props {
    open: boolean
    onClose: () => void
    onSelect: (injectable: { invocationText: string }) => void
  }

  let { open, onClose, onSelect }: Props = $props()
</script>

{#if open}
  <div data-testid="picker-double">
    <button
      data-testid="picker-select"
      onclick={() => onSelect({ invocationText: 'INSERTED' })}
      type="button">Select</button>
    <button data-testid="picker-close" onclick={onClose} type="button">Close</button>
  </div>
{/if}
