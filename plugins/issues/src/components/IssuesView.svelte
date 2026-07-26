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
  import { useIssuesBoard } from './useIssuesBoard.svelte'
  import { useIssuesColumnSettings } from './useIssuesColumnSettings.svelte'
  import { useIssuesCreateDialog } from './useIssuesCreateDialog.svelte'
  import { useIssuesDrawer } from './useIssuesDrawer.svelte'

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
  const drawer = useIssuesDrawer(() => issues.board)
  // svelte-ignore state_referenced_locally
  const createDialog = useIssuesCreateDialog(api, issues)
  const columnSettings = useIssuesColumnSettings(issues)

  // Reset view-local state only when the logical project changes. This intentionally
  // has no effect cleanup: prop identity churn for the same project must not close resources.
  $effect(() => {
    const pid = projectId
    if (issues.activateProject(pid)) {
      drawer.close()
      createDialog.close()
      columnSettings.close()
    }
  })

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

<div class="flex flex-col h-full overflow-hidden">
  <PluginPageHeader
    title={projectName || 'Issues'}
    subtitle={issues.repoSlug || 'Issues board'}
  >
    {#snippet actions()}
      <div class="flex items-center gap-2 shrink-0">
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

  <div class="flex-1 overflow-hidden">
    <PluginViewState
      loading={issues.isLoading && !issues.board}
      loadingLabel="Loading board…"
      error={projectId && issues.error && !issues.board ? issues.error : null}
      errorTitle="No GitHub board for this project."
      empty={!projectId}
      emptyTitle="Select a project to view its issues."
    >
      {#if issues.board}
        <Board
          columns={issues.board.columns}
          repo={issues.repoSlug}
          busy={issues.busy}
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
        />
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
