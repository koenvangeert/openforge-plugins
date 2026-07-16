// All Jira Cloud HTTP lives here and runs ONLY in the backend (see docs/adr/0002):
// the renderer would hit CORS on *.atlassian.net and would expose the token to
// the DOM/devtools. `fetch` is injected so these functions are unit-testable.

import type { JiraCredentials } from './credentials'
import type { IssueResult, JiraIssue, JiraSearchRow, SearchResult, TestConnectionResult } from './jiraTypes'

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

/** Pull a human-readable message out of a Jira error body, falling back to status text. */
async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { errorMessages?: unknown; errors?: unknown }
    const messages = Array.isArray(body.errorMessages)
      ? body.errorMessages.filter((m): m is string => typeof m === 'string')
      : []
    if (messages.length > 0) return messages.join(' ')
    if (body.errors && typeof body.errors === 'object') {
      const values = Object.values(body.errors as Record<string, unknown>).filter(
        (v): v is string => typeof v === 'string',
      )
      if (values.length > 0) return values.join(' ')
    }
  } catch {
    // fall through to status text
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
  summary?: string
  status?: { name?: string }
  issuetype?: { name?: string }
  assignee?: { displayName?: string } | null
  updated?: string
}

interface RawIssue {
  key: string
  fields?: RawIssueFields
  renderedFields?: { description?: string }
}

/** GET /rest/api/3/issue/{key}?expand=renderedFields */
export async function fetchIssue(creds: JiraCredentials, key: string, fetchImpl: FetchLike = fetch): Promise<IssueResult> {
  const url = `${creds.site}/rest/api/3/issue/${encodeURIComponent(key)}?expand=renderedFields`
  let response: Response
  try {
    response = await fetchImpl(url, { headers: jsonHeaders(creds) })
  } catch (error) {
    return { ok: false, error: 'network', message: networkMessage(error) }
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: 'invalid-credentials', message: 'Jira rejected the configured credentials.' }
  }
  if (response.status === 404) {
    return { ok: false, error: 'not-found', message: `Issue ${key} was not found.` }
  }
  if (!response.ok) {
    return { ok: false, error: 'unknown', message: await errorMessage(response) }
  }
  const data = (await response.json()) as RawIssue
  return { ok: true, issue: normalizeIssue(creds, data) }
}

interface RawSearchResponse {
  issues?: RawIssue[]
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
  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: jsonHeaders(creds),
      body: JSON.stringify({ jql, maxResults, fields: ['summary', 'status', 'issuetype', 'assignee'] }),
    })
  } catch (error) {
    return { ok: false, error: 'network', message: networkMessage(error) }
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: 'invalid-credentials', message: 'Jira rejected the configured credentials.' }
  }
  if (response.status === 400) {
    return { ok: false, error: 'invalid-jql', message: await errorMessage(response) }
  }
  if (!response.ok) {
    return { ok: false, error: 'unknown', message: await errorMessage(response) }
  }
  const data = (await response.json()) as RawSearchResponse
  const rows: JiraSearchRow[] = (data.issues ?? []).map((issue) => {
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

/** GET /rest/api/3/myself — cheap credential probe for the settings "Test" button. */
export async function testConnection(creds: JiraCredentials, fetchImpl: FetchLike = fetch): Promise<TestConnectionResult> {
  const url = `${creds.site}/rest/api/3/myself`
  let response: Response
  try {
    response = await fetchImpl(url, { headers: jsonHeaders(creds) })
  } catch (error) {
    return { ok: false, error: 'network', message: networkMessage(error) }
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: 'invalid-credentials', message: 'Jira rejected the configured credentials.' }
  }
  if (!response.ok) {
    return { ok: false, error: 'unknown', message: await errorMessage(response) }
  }
  const data = (await response.json()) as RawMyself
  return { ok: true, displayName: data.displayName ?? creds.email }
}
