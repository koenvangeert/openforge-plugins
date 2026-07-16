import { describe, expect, it, vi } from 'vitest'
import type { JiraCredentials } from './credentials'
import { fetchIssue, searchIssues, testConnection } from './jiraClient'

const creds: JiraCredentials = { site: 'https://acme.atlassian.net', email: 'me@acme.com', apiToken: 'tok' }

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    json: async () => body,
  } as unknown as Response
}

const okFetch = (body: unknown) => vi.fn(async () => response(200, body))

describe('fetchIssue', () => {
  it('requests renderedFields and normalizes the issue', async () => {
    const fetchImpl = okFetch({
      key: 'PROJ-1',
      fields: {
        summary: 'Do the thing',
        status: { name: 'In Progress' },
        issuetype: { name: 'Story' },
        assignee: { displayName: 'Ada' },
        updated: '2026-07-09T10:00:00.000+0000',
      },
      renderedFields: { description: '<p>Hello</p>' },
    })

    const result = await fetchIssue(creds, 'PROJ-1', fetchImpl)

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://acme.atlassian.net/rest/api/3/issue/PROJ-1?expand=renderedFields',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) }) }),
    )
    expect(result).toEqual({
      ok: true,
      issue: {
        key: 'PROJ-1',
        summary: 'Do the thing',
        status: 'In Progress',
        issueType: 'Story',
        assignee: 'Ada',
        updated: '2026-07-09T10:00:00.000+0000',
        descriptionHtml: '<p>Hello</p>',
        url: 'https://acme.atlassian.net/browse/PROJ-1',
      },
    })
  })

  it('maps 401/403 to invalid-credentials', async () => {
    const result = await fetchIssue(creds, 'PROJ-1', vi.fn(async () => response(401, {})))
    expect(result).toMatchObject({ ok: false, error: 'invalid-credentials' })
  })

  it('maps 404 to not-found', async () => {
    const result = await fetchIssue(creds, 'NOPE-9', vi.fn(async () => response(404, {})))
    expect(result).toMatchObject({ ok: false, error: 'not-found' })
  })

  it('maps a thrown fetch to network', async () => {
    const result = await fetchIssue(creds, 'PROJ-1', vi.fn(async () => { throw new Error('offline') }))
    expect(result).toMatchObject({ ok: false, error: 'network', message: 'offline' })
  })

  it('maps other non-ok responses to unknown with the Jira message', async () => {
    const result = await fetchIssue(
      creds,
      'PROJ-1',
      vi.fn(async () => response(500, { errorMessages: ['Internal error'] })),
    )
    expect(result).toEqual({ ok: false, error: 'unknown', message: 'Internal error' })
  })

  it('falls back to status text when the error body has no messages', async () => {
    const result = await fetchIssue(creds, 'PROJ-1', vi.fn(async () => response(503, {})))
    expect(result).toMatchObject({ ok: false, error: 'unknown', message: 'HTTP 503' })
  })
})

describe('searchIssues', () => {
  it('POSTs the JQL and maps rows', async () => {
    const fetchImpl = okFetch({
      issues: [
        { key: 'PROJ-1', fields: { summary: 'One', status: { name: 'To Do' }, issuetype: { name: 'Bug' }, assignee: null } },
      ],
    })
    const result = await searchIssues(creds, 'project = PROJ', fetchImpl)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://acme.atlassian.net/rest/api/3/search/jql',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result).toEqual({
      ok: true,
      rows: [{ key: 'PROJ-1', summary: 'One', status: 'To Do', issueType: 'Bug', assignee: null, url: 'https://acme.atlassian.net/browse/PROJ-1' }],
    })
  })

  it('returns an empty row list for no matches', async () => {
    const result = await searchIssues(creds, 'project = EMPTY', okFetch({ issues: [] }))
    expect(result).toEqual({ ok: true, rows: [] })
  })

  it('maps 400 to invalid-jql with the Jira message', async () => {
    const result = await searchIssues(
      creds,
      'this is not jql',
      vi.fn(async () => response(400, { errorMessages: ["Error in JQL near 'not'."] })),
    )
    expect(result).toEqual({ ok: false, error: 'invalid-jql', message: "Error in JQL near 'not'." })
  })

  it('maps 401 to invalid-credentials', async () => {
    const result = await searchIssues(creds, 'project = PROJ', vi.fn(async () => response(403, {})))
    expect(result).toMatchObject({ ok: false, error: 'invalid-credentials' })
  })
})

describe('testConnection', () => {
  it('returns the display name on success', async () => {
    const result = await testConnection(creds, okFetch({ displayName: 'Ada Lovelace' }))
    expect(result).toEqual({ ok: true, displayName: 'Ada Lovelace' })
  })

  it('maps 401 to invalid-credentials', async () => {
    const result = await testConnection(creds, vi.fn(async () => response(401, {})))
    expect(result).toMatchObject({ ok: false, error: 'invalid-credentials' })
  })
})
