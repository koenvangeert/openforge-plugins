import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { sanitizeHtml } from '@openforge-app/plugin-sdk/sanitize'
import { readIntakeFilters } from './intakeFilters'
import { isValidIssueKey, validateJql } from './issueKey'
import type { IssueResult, JiraIssue, SearchIssuesRequest, SearchResult } from './jiraTypes'
import { invokeJiraBackend } from './protocol'
import { readLinkedKey } from './taskLink'

export type IntakeControllerApi = Pick<FrontendOpenForgeAPI, 'backend' | 'storage' | 'tasks'>

export interface IssueLinkState {
  issueKey: string
  linkedTaskCount: number
  taskIds: string[]
}

export type IssueLinkStates = Record<string, IssueLinkState>

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

export async function lookupIntakeIssue(api: IntakeControllerApi, input: string): Promise<IssueResult> {
  const key = input.trim().toUpperCase()
  if (!isValidIssueKey(key)) {
    return { ok: false, error: 'invalid-key', message: 'Enter a valid issue key like PROJ-123.' }
  }

  let result: IssueResult
  try {
    result = await invokeJiraBackend(api.backend, 'getIssue', { key })
  } catch (error) {
    return backendTransportFailure(error)
  }
  return result.ok ? { ok: true, issue: sanitizeIssue(result.issue) } : result
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
  api: IntakeControllerApi,
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
