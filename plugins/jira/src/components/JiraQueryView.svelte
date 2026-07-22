<script lang="ts">
  import { onMount } from 'svelte'
  import type { PluginViewProps } from '@openforge-app/plugin-sdk/frontend'
  import type { JiraErrorCode, JiraIssue } from '../lib/jiraTypes'
  import {
    createAndStartIntakeTask,
    createIntakeTask,
    deriveIssueLinkStates,
    issueLinkState,
    searchIntakeIssues,
    upsertLinkedTask,
  } from '../lib/intakeController'
  import type { Task } from '@openforge-app/plugin-sdk/domain'
  import type { DuplicateConfirmationRequired, IssueLinkStates } from '../lib/intakeController'
  import { DEFAULT_INTAKE_JQL, readIntakeQuery, saveIntakeQuery } from '../lib/intakeQuery'
  import {
    DEFAULT_INTAKE_TEMPLATE,
    readIntakeTemplate,
    saveIntakeTemplate,
    TEMPLATE_PLACEHOLDERS,
  } from '../lib/intakeTemplate'
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

  const templatePlaceholderTokens = TEMPLATE_PLACEHOLDERS.map((name) => `{{${name}}}`)

  let projectId = $state<string | null>(null)
  let jql = $state(DEFAULT_INTAKE_JQL)
  let jqlDraft = $state(DEFAULT_INTAKE_JQL)
  let applyingJql = $state(false)
  let sorting = $state(false)
  let queryReady = $state(false)
  let templateDraft = $state(DEFAULT_INTAKE_TEMPLATE)
  let templateReady = $state(false)
  let savingTemplate = $state(false)
  let templateError = $state<string | null>(null)
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
  let applySequence = 0
  let templateSequence = 0
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
    if (!projectId || !queryReady) return false
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

  async function applyJql() {
    if (!projectId || !queryReady || applyingJql || sorting) return
    const applyProjectId = projectId
    const sequence = ++applySequence
    applyingJql = true
    try {
      const accepted = await run(null, jqlDraft)
      if (accepted && sequence === applySequence && projectId === applyProjectId) {
        await saveIntakeQuery(api, applyProjectId, jql)
      }
    } catch (cause) {
      if (sequence !== applySequence || projectId !== applyProjectId) return
      error = {
        code: 'unknown',
        message: cause instanceof Error ? cause.message : 'Could not save the Project JQL query.',
      }
    } finally {
      if (sequence === applySequence) applyingJql = false
    }
  }

  async function sortStatus(direction: SortDirection) {
    if (!projectId || !queryReady || loading || applyingJql || sorting) return
    const sortProjectId = projectId
    const sequence = ++applySequence
    sorting = true
    try {
      const accepted = await run(null, withStatusSort(jql, direction))
      if (accepted && sequence === applySequence && projectId === sortProjectId) {
        jqlDraft = jql
        await saveIntakeQuery(api, sortProjectId, jql)
      }
    } catch (cause) {
      if (sequence !== applySequence || projectId !== sortProjectId) return
      error = {
        code: 'unknown',
        message: cause instanceof Error ? cause.message : 'Could not save the Jira status ordering.',
      }
    } finally {
      if (sequence === applySequence) sorting = false
    }
  }

  async function applyTemplate() {
    if (!projectId || !templateReady || savingTemplate) return
    const applyProjectId = projectId
    const sequence = ++templateSequence
    savingTemplate = true
    templateError = null
    try {
      const saved = await saveIntakeTemplate(api, applyProjectId, templateDraft)
      if (sequence !== templateSequence || projectId !== applyProjectId) return
      templateDraft = saved
    } catch (cause) {
      if (sequence !== templateSequence || projectId !== applyProjectId) return
      templateError = cause instanceof Error ? cause.message : 'Could not save the Intake template.'
    } finally {
      if (sequence === templateSequence) savingTemplate = false
    }
  }

  function recordCreatedLink(issueKey: string, task: Task) {
    linkStates = { ...linkStates, [issueKey]: upsertLinkedTask(linkStates[issueKey], issueKey, task) }
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

      if (projectId === intakeProjectId) recordCreatedLink(result.issueKey, result.task)
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

  async function loadTemplate(nextProjectId: string, sequence: number) {
    try {
      const storedTemplate = await readIntakeTemplate(api, nextProjectId)
      if (sequence !== projectSequence || projectId !== nextProjectId) return
      templateDraft = storedTemplate
      templateReady = true
    } catch {
      // A load failure means Project storage is unavailable, which the JQL load
      // already surfaces as the workspace error. Leave the template field
      // disabled rather than raising a second, redundant alert; the inline
      // template alert is reserved for actionable save-validation failures.
    }
  }

  async function loadProject(nextProjectId: string | null) {
    const sequence = ++projectSequence
    applySequence += 1
    templateSequence += 1
    applyingJql = false
    sorting = false
    savingTemplate = false
    queryReady = false
    templateReady = false
    templateError = null
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
    jql = ''
    jqlDraft = ''
    templateDraft = ''
    if (!nextProjectId) {
      loading = false
      return
    }

    void loadTemplate(nextProjectId, sequence)

    try {
      const storedJql = await readIntakeQuery(api, nextProjectId)
      if (sequence !== projectSequence || projectId !== nextProjectId) return
      jql = storedJql
      jqlDraft = storedJql
      queryReady = true
      await run()
    } catch (cause) {
      if (sequence !== projectSequence || projectId !== nextProjectId) return
      loading = false
      hasRun = true
      error = {
        code: 'unknown',
        message: cause instanceof Error ? cause.message : 'Could not load the Project JQL query.',
      }
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
          <label class="flex flex-col gap-1">
            <span class="text-xs font-medium text-base-content/70">JQL</span>
            <textarea
              class="textarea textarea-bordered textarea-sm w-full resize-y font-mono text-xs leading-relaxed"
              rows="3"
              bind:value={jqlDraft}
              disabled={!queryReady}
            ></textarea>
          </label>
          <div class="mt-2 flex items-center justify-end gap-2">
            <button class="btn btn-ghost btn-sm" onclick={() => void run()} disabled={loading || !queryReady}>Refresh</button>
            <button
              class="btn btn-primary btn-sm"
              onclick={() => void applyJql()}
              disabled={applyingJql || loading || !queryReady}
            >Apply JQL</button>
          </div>
          <details class="mt-3">
            <summary class="cursor-pointer text-xs font-medium text-base-content/70">Intake template</summary>
            <div class="mt-2 flex flex-col gap-1">
              <textarea
                class="textarea textarea-bordered textarea-sm w-full resize-y font-mono text-xs leading-relaxed"
                rows="4"
                aria-label="Intake template"
                bind:value={templateDraft}
                disabled={!templateReady}
              ></textarea>
              <p class="text-xs text-base-content/60">
                Arranges the new Task's prompt at intake. Placeholders:
                {#each templatePlaceholderTokens as token, index}{#if index > 0}, {/if}<code>{token}</code>{/each}.
              </p>
              {#if templateError}
                <p class="text-xs text-error" role="alert">{templateError}</p>
              {/if}
              <div class="mt-1 flex items-center justify-end">
                <button
                  class="btn btn-primary btn-sm"
                  onclick={() => void applyTemplate()}
                  disabled={savingTemplate || !templateReady}
                >Save template</button>
              </div>
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
          onOpenTask={(taskId) => void api.navigation.navigate({ viewId: 'board', taskId })}
        />
      </div>

      <JiraIssueDetails
        issue={selectedIssue}
        linkState={selectedIssue ? issueLinkState(linkStates, selectedIssue.key) : undefined}
        {intakeBusy}
        intakeNotice={intakeNotice?.projectId === projectId && intakeNotice.issueKey === selectedIssue?.key
          ? intakeNotice
          : null}
        duplicateWarning={duplicateWarning?.issueKey === selectedIssue?.key ? duplicateWarning : null}
        focusRequest={detailsFocusRequest}
        onOpenJira={(url) => void api.system.openUrl(url)}
        onOpenTask={(taskId) => void api.navigation.navigate({ viewId: 'board', taskId })}
        onIntake={(action, confirmed) => performIntake(action, confirmed)}
        onCancelDuplicate={() => { duplicateWarning = null }}
      />
    </div>
  {/if}
</section>
