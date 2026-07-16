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

function nonJsonResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    json: async () => { throw new SyntaxError('Unexpected end of JSON input') },
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
        priority: { name: 'High' },
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
        priority: 'High',
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

  it('maps a non-JSON success response to unknown', async () => {
    const result = await fetchIssue(creds, 'PROJ-1', vi.fn(async () => nonJsonResponse(200)))

    expect(result).toEqual({ ok: false, error: 'unknown', message: 'Jira returned an invalid response.' })
  })

  it('maps an unexpected JSON success body to unknown', async () => {
    const result = await fetchIssue(creds, 'PROJ-1', okFetch(null))

    expect(result).toEqual({ ok: false, error: 'unknown', message: 'Jira returned an invalid response.' })
  })

  it('rejects an issue body that would violate the success contract', async () => {
    const result = await fetchIssue(creds, 'PROJ-1', okFetch({ key: 'PROJ-1', fields: { summary: 42 } }))

    expect(result).toEqual({ ok: false, error: 'unknown', message: 'Jira returned an invalid response.' })
  })

  it('normalizes nullable Jira fields to the documented fallbacks', async () => {
    const result = await fetchIssue(creds, 'PROJ-1', okFetch({
      key: 'PROJ-1',
      fields: { summary: null, status: null, issuetype: null, assignee: null, updated: null },
      renderedFields: { description: null },
    }))

    expect(result).toMatchObject({
      ok: true,
      issue: {
        summary: '(no summary)',
        status: 'Unknown',
        issueType: 'Unknown',
        assignee: null,
        updated: null,
        descriptionHtml: '',
      },
    })
  })
})

describe('searchIssues', () => {
  it('POSTs a continuation token and returns normalized issues with page metadata', async () => {
    const fetchImpl = okFetch({
      isLast: false,
      nextPageToken: 'page-3',
      issues: [
        {
          key: 'PROJ-1',
          fields: {
            summary: 'One',
            status: { name: 'To Do' },
            priority: { name: 'High' },
            issuetype: { name: 'Bug' },
            assignee: null,
          },
          renderedFields: { description: '<p>Details</p>' },
        },
      ],
    })
    const result = await searchIssues(creds, { jql: 'project = PROJ', nextPageToken: 'page-2' }, fetchImpl)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://acme.atlassian.net/rest/api/3/search/jql',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          jql: 'project = PROJ',
          maxResults: 50,
          nextPageToken: 'page-2',
          fields: ['summary', 'status', 'priority', 'issuetype', 'assignee', 'description'],
          expand: 'renderedFields',
        }),
      }),
    )
    expect(result).toEqual({
      ok: true,
      issues: [{
        key: 'PROJ-1',
        summary: 'One',
        status: 'To Do',
        priority: 'High',
        issueType: 'Bug',
        assignee: null,
        updated: null,
        descriptionHtml: '<p>Details</p>',
        url: 'https://acme.atlassian.net/browse/PROJ-1',
      }],
      page: { isLast: false, nextPageToken: 'page-3' },
    })
  })

  it('returns an empty issue page for no matches', async () => {
    const result = await searchIssues(creds, { jql: 'project = EMPTY' }, okFetch({ issues: [], isLast: true }))
    expect(result).toEqual({ ok: true, issues: [], page: { isLast: true, nextPageToken: null } })
  })

  it('maps 400 to invalid-jql with the Jira message', async () => {
    const result = await searchIssues(
      creds,
      { jql: 'this is not jql' },
      vi.fn(async () => response(400, { errorMessages: ["Error in JQL near 'not'."] })),
    )
    expect(result).toEqual({ ok: false, error: 'invalid-jql', message: "Error in JQL near 'not'." })
  })

  it('falls back to status text for a non-JSON error response', async () => {
    const result = await searchIssues(
      creds,
      { jql: 'this is not jql' },
      vi.fn(async () => nonJsonResponse(400)),
    )

    expect(result).toEqual({ ok: false, error: 'invalid-jql', message: 'HTTP 400' })
  })

  it('maps 401 to invalid-credentials', async () => {
    const result = await searchIssues(creds, { jql: 'project = PROJ' }, vi.fn(async () => response(403, {})))
    expect(result).toMatchObject({ ok: false, error: 'invalid-credentials' })
  })

  it('maps a non-JSON success response to unknown', async () => {
    const result = await searchIssues(creds, { jql: 'project = PROJ' }, vi.fn(async () => nonJsonResponse(200)))

    expect(result).toEqual({ ok: false, error: 'unknown', message: 'Jira returned an invalid response.' })
  })

  it('maps an unexpected JSON success body to unknown', async () => {
    const result = await searchIssues(creds, { jql: 'project = PROJ' }, okFetch({ issues: [null], isLast: true }))

    expect(result).toEqual({ ok: false, error: 'unknown', message: 'Jira returned an invalid response.' })
  })

  it('rejects a non-final page without a continuation token', async () => {
    const result = await searchIssues(creds, { jql: 'project = PROJ' }, okFetch({ issues: [], isLast: false }))

    expect(result).toEqual({ ok: false, error: 'unknown', message: 'Jira returned an invalid response.' })
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

  it('maps a non-JSON success response to unknown', async () => {
    const result = await testConnection(creds, vi.fn(async () => nonJsonResponse(200)))

    expect(result).toEqual({ ok: false, error: 'unknown', message: 'Jira returned an invalid response.' })
  })

  it('maps an unexpected JSON success body to unknown', async () => {
    const result = await testConnection(creds, okFetch({ displayName: 42 }))

    expect(result).toEqual({ ok: false, error: 'unknown', message: 'Jira returned an invalid response.' })
  })
})
