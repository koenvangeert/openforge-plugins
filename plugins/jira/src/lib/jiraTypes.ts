// Domain shapes exchanged between the backend (Jira HTTP) and the renderer.
// These are the plugin's normalized view of a Jira Cloud issue — not the raw
// REST payload.

/**
 * Discriminated failure codes surfaced to the UI. The backend always returns a
 * result object (never throws across api.backend.invoke) so the renderer can
 * render a specific state for each case.
 */
export type JiraErrorCode =
  | 'no-credentials'
  | 'invalid-credentials'
  | 'not-found'
  | 'invalid-jql'
  | 'network'
  | 'unknown'

export interface JiraIssue {
  key: string
  summary: string
  status: string
  issueType: string
  assignee: string | null
  updated: string | null
  /** Raw HTML from renderedFields.description; sanitized in the renderer before {@html}. */
  descriptionHtml: string
  /** Browser URL, e.g. https://site.atlassian.net/browse/PROJ-1. */
  url: string
}

export interface JiraSearchRow {
  key: string
  summary: string
  status: string
  issueType: string
  assignee: string | null
  url: string
}

export type IssueResult =
  | { ok: true; issue: JiraIssue }
  | { ok: false; error: JiraErrorCode; message: string }

export type SearchResult =
  | { ok: true; rows: JiraSearchRow[] }
  | { ok: false; error: JiraErrorCode; message: string }

export type TestConnectionResult =
  | { ok: true; displayName: string }
  | { ok: false; error: JiraErrorCode; message: string }
