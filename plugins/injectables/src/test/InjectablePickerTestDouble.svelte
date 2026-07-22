<script lang="ts">
  import { receivedPickerProps } from './injectablePickerTestDoubleState'

  interface Props {
    api: unknown
    projectId: string | null
    open: boolean
    onClose: () => void
    onSelect: (injectable: { invocationText: string }) => void
  }

  let { api, projectId, open, onClose, onSelect }: Props = $props()

  $effect(() => {
    receivedPickerProps.api = api
    receivedPickerProps.projectId = projectId
  })
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
