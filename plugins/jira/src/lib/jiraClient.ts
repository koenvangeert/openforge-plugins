// All Jira Cloud HTTP lives here and runs ONLY in the backend (see docs/adr/0002):
// the renderer would hit CORS on *.atlassian.net and would expose the token to
// the DOM/devtools. `fetch` is injected so these functions are unit-testable.

import type { JiraCredentials } from './credentials'
import type {
  IssueResult,
  JiraErrorCode,
  JiraIssue,
  JiraSearchRow,
  SearchResult,
  TestConnectionResult,
} from './jiraTypes'

type FetchLike = typeof fetch

function authHeader(creds: JiraCredentials): string {
  // Jira Cloud Basic auth = base64(email:apiToken).
  const token = Buffer.from(`${creds.email}:${creds.apiToken}`).toString('base64')
  return `Basic ${token}`
}

function jsonHeaders(creds: JiraCredentials): Record<string, string> {
  return {
    Authorization: authHeader(creds),
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

function networkMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not reach Jira.'
}

type JiraFailure = { ok: false; error: JiraErrorCode; message: string }
type JiraResponse = { ok: true; response: Response } | JiraFailure
type JsonBody = { ok: true; data: unknown } | { ok: false }

function invalidResponse(): JiraFailure {
  return { ok: false, error: 'unknown', message: 'Jira returned an invalid response.' }
}

async function readJson(response: Response): Promise<JsonBody> {
  try {
    return { ok: true, data: await response.json() }
  } catch {
    return { ok: false }
  }
}

async function requestJira(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<JiraResponse> {
  let response: Response
  try {
    response = await fetchImpl(url, init)
  } catch (error) {
    return { ok: false, error: 'network', message: networkMessage(error) }
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: 'invalid-credentials', message: 'Jira rejected the configured credentials.' }
  }
  return { ok: true, response }
}

async function decodeJson<T>(response: Response, isExpected: (value: unknown) => value is T): Promise<
  { ok: true; data: T } | JiraFailure
> {
  const body = await readJson(response)
  if (!body.ok || !isExpected(body.data)) return invalidResponse()
  return { ok: true, data: body.data }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Pull a human-readable message out of a Jira error body, falling back to status text. */
async function errorMessage(response: Response): Promise<string> {
  const parsed = await readJson(response)
  if (parsed.ok && isRecord(parsed.data)) {
    const messages = Array.isArray(parsed.data.errorMessages)
      ? parsed.data.errorMessages.filter((m): m is string => typeof m === 'string')
      : []
    if (messages.length > 0) return messages.join(' ')
    if (isRecord(parsed.data.errors)) {
      const values = Object.values(parsed.data.errors).filter(
        (v): v is string => typeof v === 'string',
      )
      if (values.length > 0) return values.join(' ')
    }
  }
  return response.statusText || `HTTP ${response.status}`
}

function browseUrl(creds: JiraCredentials, key: string): string {
  return `${creds.site}/browse/${key}`
}

function normalizeIssue(creds: JiraCredentials, data: RawIssue): JiraIssue {
  const fields = data.fields ?? {}
  return {
    key: data.key,
    summary: fields.summary ?? '(no summary)',
    status: fields.status?.name ?? 'Unknown',
    issueType: fields.issuetype?.name ?? 'Unknown',
    assignee: fields.assignee?.displayName ?? null,
    updated: fields.updated ?? null,
    descriptionHtml: data.renderedFields?.description ?? '',
    url: browseUrl(creds, data.key),
  }
}

interface RawIssueFields {
  summary?: string | null
  status?: { name?: string | null } | null
  issuetype?: { name?: string | null } | null
  assignee?: { displayName?: string | null } | null
  updated?: string | null
}

interface RawIssue {
  key: string
  fields?: RawIssueFields | null
  renderedFields?: { description?: string | null } | null
}

function hasOptionalNullableString(record: Record<string, unknown>, key: string): boolean {
  return record[key] === undefined || record[key] === null || typeof record[key] === 'string'
}

function isNamedField(value: unknown): boolean {
  return isRecord(value) && hasOptionalNullableString(value, 'name')
}

function isRawIssueFields(value: unknown): value is RawIssueFields {
  if (!isRecord(value)) return false
  if (!hasOptionalNullableString(value, 'summary') || !hasOptionalNullableString(value, 'updated')) return false
  if (value.status !== undefined && value.status !== null && !isNamedField(value.status)) return false
  if (value.issuetype !== undefined && value.issuetype !== null && !isNamedField(value.issuetype)) return false
  if (value.assignee !== undefined && value.assignee !== null) {
    if (!isRecord(value.assignee) || !hasOptionalNullableString(value.assignee, 'displayName')) return false
  }
  return true
}

function isRawIssue(value: unknown): value is RawIssue {
  if (!isRecord(value) || typeof value.key !== 'string') return false
  if (value.fields !== undefined && value.fields !== null && !isRawIssueFields(value.fields)) return false
  if (value.renderedFields !== undefined && value.renderedFields !== null) {
    if (!isRecord(value.renderedFields) || !hasOptionalNullableString(value.renderedFields, 'description')) return false
  }
  return true
}

/** GET /rest/api/3/issue/{key}?expand=renderedFields */
export async function fetchIssue(creds: JiraCredentials, key: string, fetchImpl: FetchLike = fetch): Promise<IssueResult> {
  const url = `${creds.site}/rest/api/3/issue/${encodeURIComponent(key)}?expand=renderedFields`
  const request = await requestJira(fetchImpl, url, { headers: jsonHeaders(creds) })
  if (!request.ok) return request
  const { response } = request
  if (response.status === 404) {
    return { ok: false, error: 'not-found', message: `Issue ${key} was not found.` }
  }
  if (!response.ok) {
    return { ok: false, error: 'unknown', message: await errorMessage(response) }
  }
  const parsed = await decodeJson(response, isRawIssue)
  if (!parsed.ok) return parsed
  return { ok: true, issue: normalizeIssue(creds, parsed.data) }
}

interface RawSearchResponse {
  issues: RawIssue[]
}

function isRawSearchResponse(value: unknown): value is RawSearchResponse {
  return isRecord(value) && Array.isArray(value.issues) && value.issues.every(isRawIssue)
}

/**
 * POST /rest/api/3/search/jql — Jira Cloud's current JQL search endpoint (the
 * classic /rest/api/3/search was removed by Atlassian in 2025). It requires an
 * explicit `fields` list and paginates with `nextPageToken`; v1 shows only the
 * first page (up to `maxResults`) and ignores the token. The success payload
 * still exposes `.issues`, so normalization is unchanged.
 */
export async function searchIssues(
  creds: JiraCredentials,
  jql: string,
  fetchImpl: FetchLike = fetch,
  maxResults = 50,
): Promise<SearchResult> {
  const url = `${creds.site}/rest/api/3/search/jql`
  const request = await requestJira(fetchImpl, url, {
    method: 'POST',
    headers: jsonHeaders(creds),
    body: JSON.stringify({ jql, maxResults, fields: ['summary', 'status', 'issuetype', 'assignee'] }),
  })
  if (!request.ok) return request
  const { response } = request
  if (response.status === 400) {
    return { ok: false, error: 'invalid-jql', message: await errorMessage(response) }
  }
  if (!response.ok) {
    return { ok: false, error: 'unknown', message: await errorMessage(response) }
  }
  const parsed = await decodeJson(response, isRawSearchResponse)
  if (!parsed.ok) return parsed
  const rows: JiraSearchRow[] = parsed.data.issues.map((issue) => {
    const fields = issue.fields ?? {}
    return {
      key: issue.key,
      summary: fields.summary ?? '(no summary)',
      status: fields.status?.name ?? 'Unknown',
      issueType: fields.issuetype?.name ?? 'Unknown',
      assignee: fields.assignee?.displayName ?? null,
      url: browseUrl(creds, issue.key),
    }
  })
  return { ok: true, rows }
}

interface RawMyself {
  displayName?: string
}

function isRawMyself(value: unknown): value is RawMyself {
  return isRecord(value) && (value.displayName === undefined || typeof value.displayName === 'string')
}

/** GET /rest/api/3/myself — cheap credential probe for the settings "Test" button. */
export async function testConnection(creds: JiraCredentials, fetchImpl: FetchLike = fetch): Promise<TestConnectionResult> {
  const url = `${creds.site}/rest/api/3/myself`
  const request = await requestJira(fetchImpl, url, { headers: jsonHeaders(creds) })
  if (!request.ok) return request
  const { response } = request
  if (!response.ok) {
    return { ok: false, error: 'unknown', message: await errorMessage(response) }
  }
  const parsed = await decodeJson(response, isRawMyself)
  if (!parsed.ok) return parsed
  return { ok: true, displayName: parsed.data.displayName ?? creds.email }
}
