import type { ImplementationRun } from '@openforge-app/plugin-sdk'
import type { BoardStatus, Task } from '@openforge-app/plugin-sdk/domain'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { sanitizeHtml } from '@openforge-app/plugin-sdk/sanitize'
import { readIntakeTemplate, renderIntakeTemplate } from './intakeTemplate'
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

export interface LinkedTaskSummary {
  id: string
  /** Resolved display title; never null, unlike {@link Task.title}. */
  title: string
  status: BoardStatus
  updatedAt: number
}

export interface IssueLinkState {
  issueKey: string
  /** Linked Tasks in the active Project, most recently updated first. */
  tasks: LinkedTaskSummary[]
}

export type IssueLinkStates = Record<string, IssueLinkState>

/** Resolve a Task's display title: explicit title, else first non-empty prompt line, else id. */
export function taskDisplayTitle(task: Pick<Task, 'id' | 'title' | 'initial_prompt'>): string {
  const explicit = task.title?.trim()
  if (explicit) return explicit
  const firstLine = task.initial_prompt.split('\n').map((line) => line.trim()).find(Boolean)
  return firstLine ?? task.id
}

export function toLinkedTaskSummary(task: Task): LinkedTaskSummary {
  return { id: task.id, title: taskDisplayTitle(task), status: task.status, updatedAt: task.updated_at }
}

function byMostRecentlyUpdated(a: LinkedTaskSummary, b: LinkedTaskSummary): number {
  return b.updatedAt - a.updatedAt
}

/** Add or replace a linked Task in a state, keeping the most-recently-updated-first ordering. */
export function upsertLinkedTask(state: IssueLinkState | undefined, issueKey: string, task: Task): IssueLinkState {
  const summary = toLinkedTaskSummary(task)
  const others = (state?.tasks ?? []).filter((existing) => existing.id !== summary.id)
  return { issueKey, tasks: [summary, ...others].sort(byMostRecentlyUpdated) }
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

export async function deriveIssueLinkStates(
  api: IssueIntakeApi,
  projectId: string,
  issueKeys: string[],
): Promise<IssueLinkStates> {
  const keys = [...new Set(issueKeys.map((key) => key.trim().toUpperCase()))]
  const states: IssueLinkStates = {}
  for (const issueKey of keys) {
    states[issueKey] = { issueKey, tasks: [] }
  }
  const tasks = await api.tasks.list({ projectId })
  const links = await Promise.all(tasks.map(async (task) => ({
    task,
    issueKey: (await readLinkedKey(api, task.id))?.toUpperCase() ?? null,
  })))

  for (const link of links) {
    if (!link.issueKey || !(link.issueKey in states)) continue
    states[link.issueKey].tasks.push(toLinkedTaskSummary(link.task))
  }
  for (const issueKey of keys) {
    states[issueKey].tasks.sort(byMostRecentlyUpdated)
  }
  return states
}

function duplicateConfirmation(
  projectId: string,
  state: IssueLinkState,
): DuplicateConfirmationRequired {
  const linkedTaskCount = state.tasks.length
  const taskLabel = linkedTaskCount === 1 ? 'Task' : 'Tasks'
  return {
    outcome: 'confirmation-required',
    projectId,
    issueKey: state.issueKey,
    linkedTaskCount,
    linkedTaskIds: state.tasks.map((task) => task.id),
    message: `${state.issueKey} already has ${linkedTaskCount} linked ${taskLabel} in the active Project. Confirm to create another Task.`,
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
  if (linkState.tasks.length > 0 && !request.duplicateConfirmed) {
    return duplicateConfirmation(request.projectId, linkState)
  }

  const template = await readIntakeTemplate(api, request.projectId)
  const task = await api.tasks.create({
    projectId: request.projectId,
    initialPrompt: renderIntakeTemplate(template, { ...request.issue, key: issueKey }),
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
