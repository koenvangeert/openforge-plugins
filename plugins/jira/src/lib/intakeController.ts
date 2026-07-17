import type { ImplementationRun } from '@openforge-app/plugin-sdk'
import type { Task } from '@openforge-app/plugin-sdk/domain'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { sanitizeHtml } from '@openforge-app/plugin-sdk/sanitize'
import { readIntakeFilters } from './intakeFilters'
import { validateJql } from './issueKey'
import type { JiraIssue, SearchIssuesRequest, SearchResult } from './jiraTypes'
import { invokeJiraBackend } from './protocol'
import { readLinkedKey, saveLinkedKey } from './taskLink'

export type IntakeControllerApi = Pick<FrontendOpenForgeAPI, 'backend' | 'storage' | 'tasks'>
export type IssueIntakeApi = Pick<FrontendOpenForgeAPI, 'storage' | 'tasks'>

export interface IssueIntakeRequest {
  projectId: string
  issue: Pick<JiraIssue, 'key' | 'summary' | 'descriptionHtml'>
  duplicateConfirmed?: boolean
}

export interface DuplicateConfirmationRequired {
  outcome: 'confirmation-required'
  projectId: string
  issueKey: string
  linkedTaskCount: number
  linkedTaskIds: string[]
  message: string
}

export interface IntakeTaskCreated {
  outcome: 'task-created'
  projectId: string
  issueKey: string
  task: Task
}

export interface IntakeImplementationStarted {
  outcome: 'implementation-started'
  projectId: string
  issueKey: string
  task: Task
  run: ImplementationRun
}

export interface IntakePartialSuccess {
  outcome: 'partial-success'
  projectId: string
  issueKey: string
  task: Task
  startError: {
    stage: 'start-implementation'
    message: string
  }
}

export type CreateIntakeTaskResult = DuplicateConfirmationRequired | IntakeTaskCreated

export type CreateAndStartIntakeTaskResult =
  | DuplicateConfirmationRequired
  | IntakeImplementationStarted
  | IntakePartialSuccess

export interface IssueLinkState {
  issueKey: string
  linkedTaskCount: number
  taskIds: string[]
}

export type IssueLinkStates = Record<string, IssueLinkState>

export function buildIssueIntakePrompt(
  issue: Pick<JiraIssue, 'key' | 'summary' | 'descriptionHtml'>,
): string {
  const issueKey = issue.key.trim().toUpperCase()
  const heading = `${issueKey}: ${issue.summary.trim()}`
  const description = sanitizeHtml(issue.descriptionHtml).trim()
  return description ? `${heading}\n\n${description}` : heading
}

function sanitizeIssue(issue: JiraIssue): JiraIssue {
  return { ...issue, descriptionHtml: sanitizeHtml(issue.descriptionHtml) }
}

const INCOMPATIBLE_BACKEND_RESPONSE: SearchResult = {
  ok: false,
  error: 'unknown',
  message: 'The Jira backend returned an incompatible response. Reload the Jira plugin.',
}

function hasSearchPayload(result: SearchResult): result is Extract<SearchResult, { ok: true }> {
  return result.ok
    && Array.isArray(result.issues)
    && result.page !== null
    && typeof result.page === 'object'
    && typeof result.page.isLast === 'boolean'
    && (result.page.nextPageToken === null || typeof result.page.nextPageToken === 'string')
}

function backendTransportFailure(error: unknown): Extract<SearchResult, { ok: false }> {
  return {
    ok: false,
    error: 'unknown',
    message: error instanceof Error ? error.message : 'Could not invoke the Jira backend.',
  }
}

export async function searchIntakeIssues(
  api: IntakeControllerApi,
  input: SearchIssuesRequest,
): Promise<SearchResult> {
  const validation = validateJql(input.jql)
  if (!validation.ok) return { ok: false, error: 'invalid-jql', message: validation.message }

  let result: SearchResult
  try {
    result = await invokeJiraBackend(api.backend, 'search', {
      jql: validation.jql,
      nextPageToken: input.nextPageToken?.trim() || null,
    })
  } catch (error) {
    return backendTransportFailure(error)
  }
  if (!result.ok) return result
  if (!hasSearchPayload(result)) return INCOMPATIBLE_BACKEND_RESPONSE
  return { ...result, issues: result.issues.map(sanitizeIssue) }
}

export async function searchActiveIntakeFilter(
  api: IntakeControllerApi,
  projectId: string,
  nextPageToken: string | null = null,
): Promise<SearchResult> {
  const state = await readIntakeFilters(api, projectId)
  const activeFilter = state.filters.find(({ id }) => id === state.activeFilterId)
  if (!activeFilter) {
    return { ok: false, error: 'unknown', message: 'The active Intake Filter could not be loaded.' }
  }
  return searchIntakeIssues(api, { jql: activeFilter.jql, nextPageToken })
}

export async function deriveIssueLinkStates(
  api: IssueIntakeApi,
  projectId: string,
  issueKeys: string[],
): Promise<IssueLinkStates> {
  const keys = [...new Set(issueKeys.map((key) => key.trim().toUpperCase()))]
  const states: IssueLinkStates = {}
  for (const issueKey of keys) {
    states[issueKey] = { issueKey, linkedTaskCount: 0, taskIds: [] }
  }
  const tasks = await api.tasks.list({ projectId })
  const links = await Promise.all(tasks.map(async (task) => ({
    taskId: task.id,
    issueKey: (await readLinkedKey(api, task.id))?.toUpperCase() ?? null,
  })))

  for (const link of links) {
    if (!link.issueKey || !(link.issueKey in states)) continue
    states[link.issueKey].taskIds.push(link.taskId)
    states[link.issueKey].linkedTaskCount += 1
  }
  return states
}

function duplicateConfirmation(
  projectId: string,
  state: IssueLinkState,
): DuplicateConfirmationRequired {
  const taskLabel = state.linkedTaskCount === 1 ? 'Task' : 'Tasks'
  return {
    outcome: 'confirmation-required',
    projectId,
    issueKey: state.issueKey,
    linkedTaskCount: state.linkedTaskCount,
    linkedTaskIds: state.taskIds,
    message: `${state.issueKey} already has ${state.linkedTaskCount} linked ${taskLabel} in the active Project. Confirm to create another Task.`,
  }
}

/** Create a backlog Task and persist its task-scoped Issue Link. Jira is never mutated. */
export async function createIntakeTask(
  api: IssueIntakeApi,
  request: IssueIntakeRequest,
): Promise<CreateIntakeTaskResult> {
  const issueKey = request.issue.key.trim().toUpperCase()
  const states = await deriveIssueLinkStates(api, request.projectId, [issueKey])
  const linkState = states[issueKey]
  if (linkState.linkedTaskCount > 0 && !request.duplicateConfirmed) {
    return duplicateConfirmation(request.projectId, linkState)
  }

  const task = await api.tasks.create({
    projectId: request.projectId,
    initialPrompt: buildIssueIntakePrompt({ ...request.issue, key: issueKey }),
  })
  await saveLinkedKey(api, task.id, issueKey)

  return {
    outcome: 'task-created',
    projectId: request.projectId,
    issueKey,
    task,
  }
}

/** Create and link a backlog Task, then request its native OpenForge Implementation Run. */
export async function createAndStartIntakeTask(
  api: IssueIntakeApi,
  request: IssueIntakeRequest,
): Promise<CreateAndStartIntakeTaskResult> {
  const created = await createIntakeTask(api, request)
  if (created.outcome === 'confirmation-required') return created

  try {
    const run = await api.tasks.startImplementation({ taskId: created.task.id })
    return { ...created, outcome: 'implementation-started', run }
  } catch (error) {
    return {
      ...created,
      outcome: 'partial-success',
      startError: {
        stage: 'start-implementation',
        message: error instanceof Error ? error.message : 'The Implementation Run could not be started.',
      },
    }
  }
}
