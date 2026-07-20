<script lang="ts">
  import { onMount } from 'svelte'
  import type { PluginViewProps } from '@openforge-app/plugin-sdk/frontend'
  import type { JiraErrorCode, JiraIssue } from '../lib/jiraTypes'
  import {
    createAndStartIntakeTask,
    createIntakeTask,
    deriveIssueLinkStates,
    searchIntakeIssues,
  } from '../lib/intakeController'
  import type { DuplicateConfirmationRequired, IssueLinkStates } from '../lib/intakeController'
  import {
    DEFAULT_INTAKE_FILTER,
    activateIntakeFilter,
    readIntakeFilters,
    saveIntakeFilter,
  } from '../lib/intakeFilters'
  import type { IntakeFilter } from '../lib/intakeFilters'
  import { getStatusSortDirection, withStatusSort } from '../lib/jqlSort'
  import type { SortDirection } from '../lib/jqlSort'
  import { HOST_EVENT, REFRESH_EVENT } from '../lib/protocol'
  import JiraIssueDetails from './JiraIssueDetails.svelte'
  import JiraIssueTable from './JiraIssueTable.svelte'

  interface NavigationChanged {
    activeProjectId: string | null
  }

  type IntakeAction = 'create' | 'create-start'
  type IntakeNotice = {
    tone: 'success' | 'error'
    projectId: string
    issueKey: string
    message: string
  }
  let { api }: PluginViewProps = $props()

  let projectId = $state<string | null>(null)
  let activeFilterName = $state(DEFAULT_INTAKE_FILTER.name)
  let filters = $state<IntakeFilter[]>([DEFAULT_INTAKE_FILTER])
  let activeFilterId = $state(DEFAULT_INTAKE_FILTER.id)
  let jql = $state(DEFAULT_INTAKE_FILTER.jql)
  let jqlDraft = $state(DEFAULT_INTAKE_FILTER.jql)
  let applyingJql = $state(false)
  let sorting = $state(false)
  let filterChanging = $state(false)
  let filterReady = $state(false)
  let intakeBusy = $state(false)
  let intakeNotice = $state<IntakeNotice | null>(null)
  let duplicateWarning = $state<(DuplicateConfirmationRequired & { action: IntakeAction }) | null>(null)
  let rows = $state<JiraIssue[]>([])
  let linkStates = $state<IssueLinkStates>({})
  let selectedIssue = $state<JiraIssue | null>(null)
  let nextPageToken = $state<string | null>(null)
  let pageNumber = $state(1)
  let loading = $state(false)
  let hasRun = $state(false)
  let error = $state<{ code: JiraErrorCode; message: string } | null>(null)
  let detailsFocusRequest = $state(0)
  let querySequence = 0
  let projectSequence = 0
  let intakeSequence = 0
  let filterSequence = 0
  let statusSortDirection = $derived(getStatusSortDirection(jql))

  function resetIntakeFeedback() {
    intakeNotice = null
    duplicateWarning = null
  }

  function selectIssue(issue: JiraIssue, focusDetails = true) {
    if (selectedIssue?.key !== issue.key) resetIntakeFeedback()
    selectedIssue = issue
    if (focusDetails) detailsFocusRequest += 1
  }

  async function run(pageToken: string | null = null, query = jql): Promise<boolean> {
    if (!projectId || !filterReady) return false
    const runProjectId = projectId
    const sequence = ++querySequence
    loading = true
    error = null
    const result = await searchIntakeIssues(api, { jql: query, nextPageToken: pageToken })
    if (sequence !== querySequence || projectId !== runProjectId) return false

    if (!result.ok) {
      rows = []
      linkStates = {}
      selectedIssue = null
      nextPageToken = null
      pageNumber = 1
      error = { code: result.error, message: result.message }
      loading = false
      hasRun = true
      return false
    }

    jql = query.trim()
    rows = result.issues
    nextPageToken = result.page.nextPageToken
    pageNumber = pageToken ? pageNumber + 1 : 1
    try {
      const nextLinkStates = await deriveIssueLinkStates(api, runProjectId, rows.map(({ key }) => key))
      if (sequence !== querySequence || projectId !== runProjectId) return false
      linkStates = nextLinkStates
    } catch (cause) {
      if (sequence !== querySequence || projectId !== runProjectId) return false
      loading = false
      hasRun = true
      error = {
        code: 'unknown',
        message: cause instanceof Error ? cause.message : 'Could not load OpenForge Issue Link state.',
      }
      return false
    }
    if (sequence !== querySequence || projectId !== runProjectId) return false

    const selectedRow = rows.find(({ key }) => key === selectedIssue?.key) ?? rows[0] ?? null
    if (selectedIssue?.key !== selectedRow?.key) resetIntakeFeedback()
    selectedIssue = selectedRow
    if (pageToken && selectedRow) detailsFocusRequest += 1
    loading = false
    hasRun = true
    return true
  }

  async function changeFilter(event: Event) {
    if (!projectId || !filterReady || filterChanging || sorting) return
    const changeProjectId = projectId
    const sequence = ++filterSequence
    const filterId = (event.currentTarget as HTMLSelectElement).value
    const nextFilter = filters.find(({ id }) => id === filterId)
    if (!nextFilter || filterId === activeFilterId) return
    filterChanging = true
    querySequence += 1
    resetIntakeFeedback()
    rows = []
    linkStates = {}
    selectedIssue = null
    nextPageToken = null
    pageNumber = 1
    loading = true
    hasRun = false
    error = null
    try {
      const state = await activateIntakeFilter(api, changeProjectId, filterId)
      if (sequence !== filterSequence || projectId !== changeProjectId) return
      filters = state.filters
      activeFilterId = state.activeFilterId
      activeFilterName = nextFilter.name
      jql = nextFilter.jql
      jqlDraft = nextFilter.jql
      await run()
    } catch (cause) {
      if (sequence !== filterSequence || projectId !== changeProjectId) return
      loading = false
      hasRun = true
      error = {
        code: 'unknown',
        message: cause instanceof Error ? cause.message : 'Could not activate the Intake Filter.',
      }
    } finally {
      if (sequence === filterSequence) filterChanging = false
    }
  }

  async function applyJql() {
    if (!projectId || !filterReady || applyingJql || sorting) return
    const applyProjectId = projectId
    const applyFilterId = activeFilterId
    const sequence = ++filterSequence
    applyingJql = true
    try {
      const accepted = await run(null, jqlDraft)
      if (accepted && sequence === filterSequence && projectId === applyProjectId) {
        const activeFilter = filters.find(({ id }) => id === applyFilterId)
        if (activeFilter) {
          const state = await saveIntakeFilter(api, applyProjectId, { ...activeFilter, jql })
          if (sequence !== filterSequence || projectId !== applyProjectId) return
          filters = state.filters
        }
      }
    } catch (cause) {
      if (sequence !== filterSequence || projectId !== applyProjectId) return
      error = {
        code: 'unknown',
        message: cause instanceof Error ? cause.message : 'Could not save the active Intake Filter.',
      }
    } finally {
      if (sequence === filterSequence) applyingJql = false
    }
  }

  async function sortStatus(direction: SortDirection) {
    if (!projectId || !filterReady || loading || applyingJql || sorting) return
    const sortProjectId = projectId
    const sortFilterId = activeFilterId
    const sequence = ++filterSequence
    sorting = true
    try {
      const accepted = await run(null, withStatusSort(jql, direction))
      if (accepted && sequence === filterSequence && projectId === sortProjectId) {
        jqlDraft = jql
        const activeFilter = filters.find(({ id }) => id === sortFilterId)
        if (activeFilter) {
          const state = await saveIntakeFilter(api, sortProjectId, { ...activeFilter, jql })
          if (sequence !== filterSequence || projectId !== sortProjectId) return
          filters = state.filters
        }
      }
    } catch (cause) {
      if (sequence !== filterSequence || projectId !== sortProjectId) return
      error = {
        code: 'unknown',
        message: cause instanceof Error ? cause.message : 'Could not save the Jira status ordering.',
      }
    } finally {
      if (sequence === filterSequence) sorting = false
    }
  }

  function recordCreatedLink(issueKey: string, taskId: string) {
    const current = linkStates[issueKey] ?? { issueKey, linkedTaskCount: 0, taskIds: [] }
    linkStates = {
      ...linkStates,
      [issueKey]: {
        issueKey,
        linkedTaskCount: current.linkedTaskCount + 1,
        taskIds: [...current.taskIds, taskId],
      },
    }
  }

  async function performIntake(action: IntakeAction, duplicateConfirmed = false) {
    if (!projectId || !selectedIssue || intakeBusy) return
    const sequence = ++intakeSequence
    const intakeProjectId = projectId
    const issue = selectedIssue
    intakeBusy = true
    intakeNotice = null
    if (!duplicateConfirmed) duplicateWarning = null
    try {
      const request = { projectId: intakeProjectId, issue, duplicateConfirmed }
      const result = action === 'create'
        ? await createIntakeTask(api, request)
        : await createAndStartIntakeTask(api, request)
      if (sequence !== intakeSequence) return
      if (result.outcome === 'confirmation-required') {
        if (projectId === intakeProjectId && selectedIssue?.key === issue.key) {
          duplicateWarning = { ...result, action }
        }
        return
      }

      if (projectId === intakeProjectId) recordCreatedLink(result.issueKey, result.task.id)
      if (result.outcome === 'task-created') {
        intakeNotice = {
          tone: 'success',
          projectId: result.projectId,
          issueKey: result.issueKey,
          message: `Task ${result.task.id} was created and linked to ${result.issueKey}.`,
        }
      } else if (result.outcome === 'implementation-started') {
        intakeNotice = {
          tone: 'success',
          projectId: result.projectId,
          issueKey: result.issueKey,
          message: `Task ${result.task.id} was created, linked, and started.`,
        }
      } else {
        intakeNotice = {
          tone: 'error',
          projectId: result.projectId,
          issueKey: result.issueKey,
          message: `Task ${result.task.id} was created and linked, but implementation could not start: ${result.startError.message}`,
        }
      }
      duplicateWarning = null
    } catch (cause) {
      if (sequence !== intakeSequence) return
      intakeNotice = {
        tone: 'error',
        projectId: intakeProjectId,
        issueKey: issue.key,
        message: cause instanceof Error ? cause.message : 'Issue Intake could not be completed.',
      }
    } finally {
      if (sequence === intakeSequence) intakeBusy = false
    }
  }

  async function loadProject(nextProjectId: string | null) {
    const sequence = ++projectSequence
    filterSequence += 1
    filterChanging = false
    applyingJql = false
    sorting = false
    filterReady = false
    querySequence += 1
    projectId = nextProjectId
    resetIntakeFeedback()
    rows = []
    linkStates = {}
    selectedIssue = null
    nextPageToken = null
    pageNumber = 1
    loading = nextProjectId !== null
    hasRun = false
    error = null
    filters = []
    activeFilterId = ''
    activeFilterName = nextProjectId ? 'Loading Intake Filter…' : DEFAULT_INTAKE_FILTER.name
    jql = ''
    jqlDraft = ''
    if (!nextProjectId) {
      loading = false
      return
    }

    try {
      const filterState = await readIntakeFilters(api, nextProjectId)
      if (sequence !== projectSequence || projectId !== nextProjectId) return
      const activeFilter = filterState.filters.find(({ id }) => id === filterState.activeFilterId)
        ?? DEFAULT_INTAKE_FILTER
      activeFilterId = activeFilter.id
      activeFilterName = activeFilter.name
      jql = activeFilter.jql
      jqlDraft = activeFilter.jql
      filters = filterState.filters.map((filter) => ({ ...filter }))
      filterReady = true
      await run()
    } catch (cause) {
      if (sequence !== projectSequence || projectId !== nextProjectId) return
      loading = false
      hasRun = true
      error = {
        code: 'unknown',
        message: cause instanceof Error ? cause.message : 'Could not load the active Project Intake Filter.',
      }
      activeFilterName = 'Intake Filter unavailable'
    }
  }

  onMount(() => {
    void loadProject(api.navigation.get().activeProjectId)
    const refreshSubscription = api.events.on(REFRESH_EVENT, () => void run())
    const navigationSubscription = api.events.onGlobal<NavigationChanged>(
      HOST_EVENT.navigationChanged,
      ({ activeProjectId }) => void loadProject(activeProjectId),
    )
    return () => {
      void refreshSubscription.dispose()
      void navigationSubscription.dispose()
    }
  })
</script>

<section class="flex h-full min-h-0 flex-col bg-base-100" aria-labelledby="jira-intake-title">
  <header class="flex shrink-0 items-center justify-between gap-3 border-b border-base-300 px-5 py-4">
    <div>
      <h1 id="jira-intake-title" class="text-xl font-semibold">Jira intake</h1>
      <p class="text-sm text-base-content/60">{activeFilterName}</p>
    </div>
    {#if hasRun && !loading && !error}
      <span class="text-sm text-base-content/60">{rows.length} Issue{rows.length === 1 ? '' : 's'}</span>
    {/if}
  </header>

  {#if intakeNotice && (intakeNotice.projectId !== projectId || intakeNotice.issueKey !== selectedIssue?.key)}
    <div
      class="alert m-5 text-sm {intakeNotice.tone === 'success' ? 'alert-success' : 'alert-error'}"
      role={intakeNotice.tone === 'success' ? 'status' : 'alert'}
    >{intakeNotice.message}</div>
  {/if}

  {#if !projectId}
    <div class="alert m-5" role="status">Select an OpenForge Project to use Jira Intake.</div>
  {:else}
    <div class="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
      <div class="flex min-h-0 flex-col border-b border-r border-base-300">
        <div class="shrink-0 border-b border-base-300 p-4">
          <div class="flex flex-wrap items-end gap-2">
            <label class="form-control min-w-48 flex-1">
              <span class="label-text mb-1 text-xs font-medium">Intake Filter</span>
              <select
                class="select select-bordered select-sm w-full"
                value={activeFilterId}
                onchange={changeFilter}
                disabled={filterChanging || applyingJql || sorting || !filterReady}
              >
                {#each filters as filter (filter.id)}
                  <option value={filter.id}>{filter.name}</option>
                {/each}
              </select>
            </label>
            <button class="btn btn-ghost btn-sm" onclick={() => void run()} disabled={loading || !filterReady}>Refresh</button>
          </div>
          <details class="mt-2">
            <summary class="cursor-pointer text-sm font-medium text-base-content/70">Advanced JQL</summary>
            <div class="mt-2 flex flex-col gap-2">
              <label class="form-control">
                <span class="label-text mb-1 text-xs font-medium">Raw JQL</span>
                <textarea
                  class="textarea textarea-bordered font-mono text-xs"
                  rows="3"
                  bind:value={jqlDraft}
                  disabled={!filterReady}
                ></textarea>
              </label>
              <button
                class="btn btn-secondary btn-sm self-end"
                onclick={() => void applyJql()}
                disabled={applyingJql || loading || !filterReady}
              >Apply JQL</button>
            </div>
          </details>
        </div>
        <JiraIssueTable
          {rows}
          {linkStates}
          selectedKey={selectedIssue?.key ?? null}
          {loading}
          {hasRun}
          errorMessage={error?.message ?? null}
          {pageNumber}
          {nextPageToken}
          {statusSortDirection}
          {sorting}
          onSelect={(issue) => selectIssue(issue)}
          onNextPage={() => void run(nextPageToken)}
          onStatusSort={(direction) => void sortStatus(direction)}
        />
      </div>

      <JiraIssueDetails
        issue={selectedIssue}
        linkState={selectedIssue ? linkStates[selectedIssue.key] : undefined}
        {intakeBusy}
        intakeNotice={intakeNotice?.projectId === projectId && intakeNotice.issueKey === selectedIssue?.key
          ? intakeNotice
          : null}
        duplicateWarning={duplicateWarning?.issueKey === selectedIssue?.key ? duplicateWarning : null}
        focusRequest={detailsFocusRequest}
        onOpenJira={(url) => void api.system.openUrl(url)}
        onIntake={(action, confirmed) => performIntake(action, confirmed)}
        onCancelDuplicate={() => { duplicateWarning = null }}
      />
    </div>
  {/if}
</section>
