<script lang="ts">
  import { GitPullRequest } from '@lucide/svelte'
  import type { LinkedPullRequest } from '../lib/board'

  interface Props {
    pullRequests: LinkedPullRequest[]
    onOpenUrl: (url: string) => void
  }

  let { pullRequests, onOpenUrl }: Props = $props()

  function label(pr: LinkedPullRequest): string {
    return pr.title ? `Open pull request #${pr.number}: ${pr.title}` : `Open pull request #${pr.number}`
  }

  function open(event: MouseEvent, url: string) {
    event.preventDefault()
    event.stopPropagation()
    onOpenUrl(url)
  }
</script>

{#each pullRequests as pr (pr.number)}
  <a
    href={pr.htmlUrl}
    class="issue-meta-chip badge badge-outline badge-xs gap-0.5 no-underline font-normal shrink-0"
    title={pr.title || `Pull request #${pr.number}`}
    aria-label={label(pr)}
    onclick={(event) => open(event, pr.htmlUrl)}
    onkeydown={(event) => event.stopPropagation()}
  >
    <GitPullRequest size={10} />
    #{pr.number}
  </a>
{/each}
