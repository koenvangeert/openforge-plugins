import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createIssue,
  editIssue,
  encodePathSegment,
  listLabels,
  listOpenIssues,
  resolveLabels,
  updateLabelColor,
} from './client'

const REPO = { owner: 'acme', name: 'repo' }
const TOKEN = 'ghp_test'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stubFetch(...responses: Response[]) {
  const spy = vi.fn(async (_url: string, _init?: RequestInit) => responses.shift() ?? jsonResponse(200, {}))
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('listOpenIssues', () => {
  it('requests open issues with the authenticated GitHub headers', async () => {
    const spy = stubFetch(jsonResponse(200, []))

    await listOpenIssues(TOKEN, REPO)

    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/acme/repo/issues?state=open&per_page=100')
    expect(init.headers).toMatchObject({
      Authorization: `token ${TOKEN}`,
      Accept: 'application/vnd.github+json',
    })
  })

  it('drops pull requests, which the issues endpoint also returns', async () => {
    stubFetch(
      jsonResponse(200, [
        { number: 1, title: 'a real issue', labels: [] },
        { number: 2, title: 'actually a PR', labels: [], pull_request: { url: 'https://api.github.com/…' } },
        { number: 3, title: 'another issue', labels: [] },
      ]),
    )

    const issues = await listOpenIssues(TOKEN, REPO)

    expect(issues.map((issue) => issue.number)).toEqual([1, 3])
  })

  it('surfaces the GitHub error message on a failed request', async () => {
    stubFetch(jsonResponse(401, { message: 'Bad credentials' }))

    await expect(listOpenIssues(TOKEN, REPO)).rejects.toThrow(/Bad credentials/)
  })
})

describe('listLabels', () => {
  it('requests every repo label', async () => {
    const spy = stubFetch(jsonResponse(200, [{ name: 'bug', color: 'ff0000' }]))

    const labels = await listLabels(TOKEN, REPO)

    expect(spy.mock.calls[0][0]).toBe('https://api.github.com/repos/acme/repo/labels?per_page=100')
    expect(labels).toEqual([{ name: 'bug', color: 'ff0000' }])
  })
})

describe('createIssue', () => {
  it('posts the title, body and labels', async () => {
    const spy = stubFetch(jsonResponse(201, { number: 7, title: 'New', labels: [] }))

    const issue = await createIssue(TOKEN, REPO, { title: 'New', body: 'Details', labels: ['bug'] })

    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/acme/repo/issues')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ title: 'New', body: 'Details', labels: ['bug'] })
    expect(issue.number).toBe(7)
  })
})

describe('editIssue', () => {
  it('patches only the fields that were provided', async () => {
    const spy = stubFetch(jsonResponse(200, { number: 7, title: 'Renamed', labels: [] }))

    await editIssue(TOKEN, REPO, 7, { title: 'Renamed' })

    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/acme/repo/issues/7')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ title: 'Renamed' })
  })

  it('reads the current labels before applying an add, since GitHub replaces the whole set', async () => {
    const spy = stubFetch(
      jsonResponse(200, { number: 7, title: 'Issue', labels: [{ name: 'bug' }, { name: 'ui' }] }),
      jsonResponse(200, { number: 7, title: 'Issue', labels: [] }),
    )

    await editIssue(TOKEN, REPO, 7, { addLabels: ['polish'], removeLabels: ['ui'] })

    expect(spy.mock.calls[0][0]).toBe('https://api.github.com/repos/acme/repo/issues/7')
    const patch = JSON.parse((spy.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)
    expect(patch).toEqual({ labels: ['bug', 'polish'] })
  })

  it('does nothing when the edit would change no field', async () => {
    const spy = stubFetch()

    await editIssue(TOKEN, REPO, 7, {})

    expect(spy).not.toHaveBeenCalled()
  })
})

describe('resolveLabels', () => {
  it('keeps surviving labels in order, then appends additions', () => {
    expect(resolveLabels(['bug', 'ui', 'chore'], { addLabels: ['polish'], removeLabels: ['ui'] })).toEqual([
      'bug',
      'chore',
      'polish',
    ])
  })

  it('de-duplicates and lets a removal win over an addition', () => {
    expect(resolveLabels(['bug', 'bug'], { addLabels: ['bug', 'new'], removeLabels: ['new'] })).toEqual(['bug'])
  })
})

describe('updateLabelColor', () => {
  it('percent-encodes the label name into the path', async () => {
    const spy = stubFetch(jsonResponse(200, { name: 'priority: high', color: '0e8a16' }))

    await updateLabelColor(TOKEN, REPO, 'priority: high', '0e8a16')

    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/acme/repo/labels/priority%3A%20high')
    expect(JSON.parse(init.body as string)).toEqual({ color: '0e8a16' })
  })
})

describe('encodePathSegment', () => {
  it('leaves unreserved characters alone and encodes everything else', () => {
    expect(encodePathSegment('bug-fix_v2.0~x')).toBe('bug-fix_v2.0~x')
    expect(encodePathSegment('needs review')).toBe('needs%20review')
    expect(encodePathSegment('a/b')).toBe('a%2Fb')
  })
})
