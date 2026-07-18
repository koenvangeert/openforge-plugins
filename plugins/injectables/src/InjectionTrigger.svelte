<script lang="ts">
  import type { PluginInjectionPointProps } from '@openforge-app/plugin-sdk/frontend'
  import InjectablePicker from './InjectablePicker.svelte'

  // Only api/projectId/onInsert are used here; context/location/taskId are part of the
  // injection-point contract but this trigger doesn't need them.
  let { api, projectId, onInsert }: PluginInjectionPointProps = $props()

  let open = $state(false)
</script>

<button
  data-testid="injection-trigger"
  class="btn btn-ghost btn-xs gap-1"
  onclick={() => (open = true)}
  type="button">
  <span aria-hidden="true">✨</span>
  <span>Insert injectable</span>
</button>

<InjectablePicker
  {api}
  projectId={projectId}
  open={open}
  onClose={() => (open = false)}
  onSelect={(inj) => {
    onInsert(inj.invocationText)
    open = false
  }}
/>
