<script lang="ts">
  import { highlightSegments } from '../lib/search'
  import type { SearchTerms } from '../lib/search'

  interface Props {
    text: string
    terms: SearchTerms
  }

  let { text, terms }: Props = $props()

  let segments = $derived(highlightSegments(text, terms))
</script>

{#each segments as segment, i (i)}
  {#if segment.match}<mark class="bg-primary/25 text-inherit rounded-sm">{segment.text}</mark>{:else}{segment.text}{/if}
{/each}
