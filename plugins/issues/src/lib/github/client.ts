// A minimal GitHub REST client for the Issues board.
//
// Ported from OpenForge's Rust `github_client` (issues.rs + labels.rs), which the
// board used to reach through core commands. Only the five calls the board makes
// live here. The host's ETag response cache does not come along: the board fetches
// on open and after each edit rather than polling, so the cache bought little.

import type { Issue, RepoLabel, RepoRef } from '../types'

const API_ROOT = 'https://api.github.com'

export interface CreateIssueInput {
  title: string
  body: string
  labels: string[]
}

export interface EditIssueInput {
  title?: string
  body?: string
  state?: string
  addLabels?: string[]
  removeLabels?: string[]
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `token ${token}`,
    'User-Agent': 'openforge',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10',
  }
}

/**
 * Percent-encode a single URL path segment, leaving only the unreserved set
 * (`A-Za-z0-9-._~`) intact. Label names routinely carry `:` and spaces.
 */
export function encodePathSegment(value: string): string {
  const HEX = '0123456789ABCDEF'
  let encoded = ''
  for (const byte of new TextEncoder().encode(value)) {
    const char = String.fromCharCode(byte)
    if (/[A-Za-z0-9\-._~]/.test(char)) {
      encoded += char
    } else {
      encoded += `%${HEX[byte >> 4]}${HEX[byte & 0x0f]}`
    }
  }
  return encoded
}

/** Turn a failed response into an error carrying GitHub's own message. */
async function apiError(response: Response): Promise<Error> {
  let detail = ''
  try {
    const body = (await response.json()) as { message?: unknown }
    if (typeof body.message === 'string') detail = `: ${body.message}`
  } catch {
    // A non-JSON error body tells the user nothing useful; the status carries it.
  }
  return new Error(`GitHub request failed (${response.status})${detail}`)
}

async function request<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: headers(token) })
  if (!response.ok) throw await apiError(response)
  return (await response.json()) as T
}

function repoUrl(repo: RepoRef, path: string): string {
  return `${API_ROOT}/repos/${repo.owner}/${repo.name}${path}`
}

/**
 * List a repo's open issues.
 *
 * `GET /issues` returns pull requests as well; entries carrying a `pull_request`
 * field are PRs and are dropped, matching what the board has always shown.
 */
export async function listOpenIssues(token: string, repo: RepoRef): Promise<Issue[]> {
  const issues = await request<(Issue & { pull_request?: unknown })[]>(
    repoUrl(repo, '/issues?state=open&per_page=100'),
    token,
  )
  return issues.filter((issue) => issue.pull_request === undefined || issue.pull_request === null)
}

/** List every label defined on the repo — the source of the board's columns. */
export function listLabels(token: string, repo: RepoRef): Promise<RepoLabel[]> {
  return request<RepoLabel[]>(repoUrl(repo, '/labels?per_page=100'), token)
}

export function createIssue(token: string, repo: RepoRef, input: CreateIssueInput): Promise<Issue> {
  return request<Issue>(repoUrl(repo, '/issues'), token, {
    method: 'POST',
    body: JSON.stringify({ title: input.title, body: input.body, labels: input.labels }),
  })
}

/**
 * Compute the label set an edit results in: removals applied to the current set
 * first, then additions. De-duplicated, and stable — surviving labels keep their
 * original order, additions follow in the order given.
 */
export function resolveLabels(current: string[], input: EditIssueInput): string[] {
  const remove = new Set(input.removeLabels ?? [])
  const result: string[] = []
  const push = (label: string) => {
    if (remove.has(label) || result.includes(label)) return
    result.push(label)
  }
  for (const label of current) push(label)
  for (const label of input.addLabels ?? []) push(label)
  return result
}

function changesNothing(input: EditIssueInput): boolean {
  return (
    input.title === undefined &&
    input.body === undefined &&
    input.state === undefined &&
    (input.addLabels ?? []).length === 0 &&
    (input.removeLabels ?? []).length === 0
  )
}

export async function editIssue(
  token: string,
  repo: RepoRef,
  number: number,
  input: EditIssueInput,
): Promise<void> {
  if (changesNothing(input)) return

  const patch: Record<string, unknown> = {}
  if (input.title !== undefined) patch.title = input.title
  if (input.body !== undefined) patch.body = input.body
  if (input.state !== undefined) patch.state = input.state

  // GitHub replaces the whole label set on PATCH, so an add or a remove has to be
  // resolved against the issue's current labels rather than sent on its own.
  if ((input.addLabels ?? []).length > 0 || (input.removeLabels ?? []).length > 0) {
    const current = await request<Issue>(repoUrl(repo, `/issues/${number}`), token)
    patch.labels = resolveLabels(
      current.labels.map((label) => label.name),
      input,
    )
  }

  await request<Issue>(repoUrl(repo, `/issues/${number}`), token, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export async function updateLabelColor(
  token: string,
  repo: RepoRef,
  name: string,
  color: string,
): Promise<void> {
  await request<RepoLabel>(repoUrl(repo, `/labels/${encodePathSegment(name)}`), token, {
    method: 'PATCH',
    body: JSON.stringify({ color }),
  })
}
