<script lang="ts">
  import { tick } from 'svelte'
  import type { JiraIssue } from '../lib/jiraTypes'
  import { issueLinkState, type IssueLinkStates } from '../lib/intakeController'
  import type { SortDirection } from '../lib/jqlSort'

  interface Props {
    rows: JiraIssue[]
    linkStates: IssueLinkStates
    selectedKey: string | null
    loading: boolean
    hasRun: boolean
    errorMessage: string | null
    pageNumber: number
    nextPageToken: string | null
    statusSortDirection: SortDirection | null
    sorting: boolean
    focusRequest: number
    onSelect: (issue: JiraIssue) => void
    onNavigate: (issue: JiraIssue) => void
    onNextPage: () => void
    onStatusSort: (direction: SortDirection) => void
    onOpenTask: (taskId: string) => void
  }

  let {
    rows,
    linkStates,
    selectedKey,
    loading,
    hasRun,
    errorMessage,
    pageNumber,
    nextPageToken,
    statusSortDirection,
    sorting,
    focusRequest,
    onSelect,
    onNavigate,
    onNextPage,
    onStatusSort,
    onOpenTask,
  }: Props = $props()

  let rowRefs = $state<(HTMLTableRowElement | undefined)[]>([])

  let nextStatusSortDirection = $derived<SortDirection>(statusSortDirection === 'asc' ? 'desc' : 'asc')
  let statusAriaSort = $derived<'ascending' | 'descending' | 'none'>(statusSortDirection === 'asc'
    ? 'ascending'
    : statusSortDirection === 'desc' ? 'descending' : 'none')

  // Hand DOM focus to the selected row (or the first row) when the parent asks —
  // e.g. the first j/k press while focus still sits on the JQL field or Run button.
  // Only focusRequest is tracked; rows/selectedKey are read in the callback so a new
  // query alone never steals focus.
  $effect(() => {
    if (focusRequest === 0) return
    void tick().then(() => {
      const index = Math.max(0, rows.findIndex((row) => row.key === selectedKey))
      rowRefs[index]?.focus()
    })
  })

  function onRowKeydown(event: KeyboardEvent, index: number) {
    // Ignore keystrokes bubbling up from an interactive cell (e.g. the linked-Task link).
    if (event.target !== event.currentTarget) return

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(rows[index])
      return
    }

    // Terminal-style navigation: j/↓ move down, k/↑ move up. The selection (and
    // DOM focus) follows the cursor while focus stays in the list, so the detail
    // pane previews live. Enter/Space confirm the row and hand focus to details.
    const delta = event.key === 'ArrowDown' || event.key === 'j' ? 1
      : event.key === 'ArrowUp' || event.key === 'k' ? -1
      : 0
    if (delta === 0) return
    event.preventDefault()
    const target = index + delta
    if (target < 0 || target >= rows.length) return
    onNavigate(rows[target])
    rowRefs[target]?.focus()
  }

  function openTask(event: MouseEvent, taskId: string) {
    event.stopPropagation()
    onOpenTask(taskId)
  }
</script>

{#if errorMessage}
  <div class="alert alert-error m-4 text-sm" role="alert">{errorMessage}</div>
{:else if loading && rows.length === 0}
  <div class="flex items-center gap-2 p-5 text-sm text-base-content/60" role="status">
    <span class="loading loading-spinner loading-sm" aria-hidden="true"></span>
    Loading Jira Issues…
  </div>
{:else if hasRun && rows.length === 0}
  <div class="flex flex-1 items-center justify-center p-6 text-center text-base-content/60">
    No Issues match the current JQL query.
  </div>
{:else if rows.length > 0}
  <div class="min-h-0 flex-1 overflow-auto">
    <table class="table w-full">
      <thead>
        <tr>
          <th>Issue Key</th>
          <th>Summary</th>
          <th aria-label="Status" aria-sort={statusAriaSort}>
            <button
              class="btn btn-ghost btn-xs -ml-2 gap-1"
              aria-label={`Sort by status ${nextStatusSortDirection === 'asc' ? 'ascending' : 'descending'}`}
              onclick={() => onStatusSort(nextStatusSortDirection)}
              disabled={loading || sorting}
            >
              Status
              <span aria-hidden="true">{statusSortDirection === 'asc' ? '↑' : statusSortDirection === 'desc' ? '↓' : '↕'}</span>
            </button>
          </th>
          <th>Priority</th>
          <th>Assignee</th>
          <th>OpenForge</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row, index (row.key)}
          {@const linkedTasks = issueLinkState(linkStates, row.key)?.tasks ?? []}
          <tr
            bind:this={rowRefs[index]}
            class="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary {selectedKey === row.key ? 'bg-primary/10' : ''}"
            aria-selected={selectedKey === row.key}
            tabindex="0"
            onclick={() => onSelect(row)}
            onkeydown={(event) => onRowKeydown(event, index)}
          >
            <td><span class="font-medium text-primary">{row.key}</span></td>
            <td class="max-w-sm truncate">{row.summary}</td>
            <td><span class="badge badge-ghost badge-sm whitespace-nowrap">{row.status}</span></td>
            <td>{row.priority ?? '—'}</td>
            <td>{row.assignee ?? 'Unassigned'}</td>
            <td>
              {#if linkedTasks.length === 1}
                <button
                  type="button"
                  class="link link-primary block max-w-[14rem] truncate text-left"
                  title={linkedTasks[0].title}
                  onclick={(event) => openTask(event, linkedTasks[0].id)}
                >{linkedTasks[0].title}</button>
              {:else if linkedTasks.length > 1}
                <button
                  type="button"
                  class="badge badge-info badge-sm whitespace-nowrap"
                  onclick={(event) => openTask(event, linkedTasks[0].id)}
                >{linkedTasks.length} linked</button>
              {:else}
                <span class="text-base-content/50">Unlinked</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <div class="flex shrink-0 items-center justify-between border-t border-base-300 px-4 py-2">
    <span class="text-sm text-base-content/60">Page {pageNumber}</span>
    <button class="btn btn-ghost btn-sm" onclick={onNextPage} disabled={!nextPageToken || loading}>Next page</button>
  </div>
{/if}
