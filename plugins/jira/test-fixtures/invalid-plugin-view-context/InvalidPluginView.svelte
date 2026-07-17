<script lang="ts">
  import type { PluginViewProps } from '@openforge-app/plugin-sdk/frontend'

  let { context }: PluginViewProps = $props()
  const invalidValue = context.invalidContextField
</script>

<p>{invalidValue}</p>
