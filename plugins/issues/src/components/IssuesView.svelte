<script lang="ts">
  import { onDestroy } from 'svelte'
  import { RefreshCw, Plus, Columns3 } from '@lucide/svelte'
  import type { FrontendOpenForgeAPI, OpenForgeContextSnapshot } from '@openforge-app/plugin-sdk/frontend'
  import PluginPageHeader from '@openforge-app/plugin-sdk/ui/PluginPageHeader.svelte'
  import PluginViewState from '@openforge-app/plugin-sdk/ui/PluginViewState.svelte'
  import Board from './Board.svelte'
  import CardDrawer from './CardDrawer.svelte'
  import CreateDialog from './CreateDialog.svelte'
  import ColumnSettingsModal from './ColumnSettingsModal.svelte'
  import SearchInput from './SearchInput.svelte'
  import { useIssuesBoard } from './useIssuesBoard.svelte'
  import { useIssuesColumnSettings } from './useIssuesColumnSettings.svelte'
  import { useIssuesCreateDialog } from './useIssuesCreateDialog.svelte'
  import { useIssuesDrawer } from './useIssuesDrawer.svelte'
  import { useIssuesSearch } from './useIssuesSearch.svelte'
  import { isSearchFocusKey, isTypingTarget } from '../lib/searchHotkey'

  interface Props {
    api: FrontendOpenForgeAPI
    context?: OpenForgeContextSnapshot
    projectName?: string
    projectPath?: string
    projectId?: string | null
  }

  let { api, context: _context, projectName = '', projectPath: _projectPath = '', projectId = null }: Props =
    $props()

  // `api` is stable for the plugin view lifetime; capture it once in the controller.
  // svelte-ignore state_referenced_locally
  const issues = useIssuesBoard(api)
  // The drawer and search hooks both read the unfiltered board: the drawer so paging
  // through a clicked column's queue is unaffected by later query changes, search so
  // it always has the full set to filter from.
  const drawer = useIssuesDrawer(() => issues.board)
  const search = useIssuesSearch(() => issues.board)
  // svelte-ignore state_referenced_locally
  const createDialog = useIssuesCreateDialog(api, issues)
  const columnSettings = useIssuesColumnSettings(issues)

  let searchInputEl = $state<HTMLInputElement | null>(null)

  // Reset view-local state only when the logical project changes. This intentionally
  // has no effect cleanup: prop identity churn for the same project must not close resources.
  $effect(() => {
    const pid = projectId
    if (issues.activateProject(pid)) {
      drawer.close()
      createDialog.close()
      columnSettings.close()
      search.clear()
    }
  })

  // `/` focuses search from anywhere in the board (unless already typing somewhere,
  // e.g. inside the drawer's title field, or a drawer/modal is open above the board —
  // this is the one place that knows about all three at once). Esc clears an active
  // query or blurs, but only while search itself is focused.
  function handleKeydown(event: KeyboardEvent): void {
    const overlayOpen = drawer.open !== null || createDialog.open || columnSettings.open
    if (isSearchFocusKey(event) && !overlayOpen && !isTypingTarget(event.target)) {
      event.preventDefault()
      searchInputEl?.focus()
      return
    }
    if (event.key === 'Escape' && event.target === searchInputEl) {
      if (search.query) {
        event.preventDefault()
        search.clear()
      } else {
        searchInputEl?.blur()
      }
    }
  }

  function openUrl(url: string): void {
    void api.system.openUrl(url)
  }

  async function copyLink(issueNumber: number): Promise<void> {
    if (!issues.repoSlug) return
    const url = `https://github.com/${issues.repoSlug}/issues/${issueNumber}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      openUrl(url)
    }
  }

  async function setValue(value: number | null): Promise<void> {
    if (drawer.openIssueNumber === null) return
    await issues.setValue(drawer.openIssueNumber, value)
  }

  async function saveText(title: string, body: string): Promise<boolean> {
    if (drawer.openIssueNumber === null) return false
    return issues.saveText(drawer.openIssueNumber, title, body)
  }

  async function toggleLabel(name: string, currentlyOn: boolean): Promise<void> {
    if (drawer.openIssueNumber === null) return
    await issues.toggleLabel(drawer.openIssueNumber, name, currentlyOn)
  }

  async function closeIssue(): Promise<void> {
    const issueNumber = drawer.openIssueNumber
    if (issueNumber === null) return
    const closed = await issues.closeIssue(issueNumber)
    if (!closed) return

    // Advance before refreshing so the drawer does not unmount on the missing card.
    drawer.advancePastClosed(issueNumber)
    await issues.loadBoard()
  }


  function openTask(taskId: string): void {
    if (!projectId) return
    void api.navigation.navigate({ projectId, viewId: 'board', taskId })
  }

  onDestroy(() => {
    drawer.close()
  })
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="flex flex-col h-full overflow-hidden">
  <PluginPageHeader
    title={projectName || 'Issues'}
    subtitle={issues.repoSlug || 'Issues board'}
  >
    {#snippet actions()}
      <div class="flex items-center gap-2 shrink-0">
        <SearchInput
          bind:value={search.query}
          bind:inputEl={searchInputEl}
          matchCount={search.matchCount}
          totalCount={search.totalCount}
          active={search.active}
        />
        <button class="btn btn-sm" onclick={() => createDialog.show()} disabled={!issues.board || issues.busy}>
          <Plus size={14} /> Create
        </button>
        <button class="btn btn-sm" onclick={columnSettings.show} disabled={!issues.board || issues.busy}>
          <Columns3 size={14} /> Columns
        </button>
        <button class="btn btn-sm" onclick={() => issues.loadBoard()} disabled={issues.isLoading || !projectId}>
          <RefreshCw size={14} class={issues.isLoading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>
    {/snippet}
  </PluginPageHeader>

  <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
    <PluginViewState
      loading={issues.isLoading && !issues.board}
      loadingLabel="Loading board…"
      error={projectId && issues.error && !issues.board ? issues.error : null}
      errorTitle="No GitHub board for this project."
      empty={!projectId}
      emptyTitle="Select a project to view its issues."
    >
      {#if issues.board}
        {#if search.active && search.matchCount === 0}
          <div class="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
            <p class="text-sm text-base-content/60 m-0">No issues match "{search.query}".</p>
            <button class="btn btn-sm" onclick={search.clear}>Clear</button>
          </div>
        {:else if search.board}
          <Board
            columns={search.board.columns}
            repo={issues.repoSlug}
            busy={issues.busy}
            terms={search.terms}
            onCardClick={drawer.openFrom}
            onOpenUrl={openUrl}
            onCopyLink={copyLink}
            onRecolor={(name, color) => {
              void issues.recolorLabel(name, color).catch(() => undefined)
            }}
            onStart={(card) => {
              void issues.runIssueAction(card)
            }}
            onAddCard={(label) => createDialog.show(label ? [label] : [])}
            onMoveCard={(issueNumber, fromLabel, toLabel) => {
              void issues.moveCard(issueNumber, fromLabel, toLabel)
            }}
          />
        {/if}
      {/if}
    </PluginViewState>
  </div>
</div>

{#if drawer.open && drawer.selectedCard && issues.board}
  <CardDrawer
    card={drawer.selectedCard}
    repo={issues.repoSlug}
    allLabels={issues.repoLabels}
    busy={issues.busy}
    index={drawer.open.index}
    total={drawer.open.issueNumbers.length}
    groupTitle={drawer.open.groupTitle}
    onPrev={() => drawer.go(-1)}
    onNext={() => drawer.go(1)}
    onClose={drawer.close}
    onOpenUrl={openUrl}
    onCopyLink={copyLink}
    onSaveText={saveText}
    onSetValue={setValue}
    onToggleLabel={toggleLabel}
    onCloseIssue={closeIssue}
    onOpenTask={openTask}
    onStart={(card) => {
      void issues.runIssueAction(card)
    }}
  />
{/if}

{#if createDialog.open && issues.board}
  <CreateDialog
    labelOptions={issues.repoLabels}
    initialLabels={createDialog.initialLabels}
    busy={issues.busy}
    hasApiKey={createDialog.hasApiKey}
    onClose={createDialog.close}
    onCreate={createDialog.createIssue}
    onRefine={createDialog.refineTicketDraft}
    onOpenUrl={openUrl}
  />
{/if}

{#if columnSettings.open && issues.board}
  <ColumnSettingsModal
    repo={issues.repoSlug}
    labels={columnSettings.labels}
    initialColumnLabels={columnSettings.columnLabels}
    busy={issues.busy}
    error={issues.error}
    onClose={columnSettings.close}
    onSave={columnSettings.save}
    onRecolor={issues.recolorLabel}
  />
{/if}
