// Issue Key helpers: recognizing a Jira Issue Key, scanning free text for a
// non-authoritative suggestion, and light client-side JQL validation.

/** A Jira Issue Key: uppercase project prefix + '-' + number, e.g. PROJ-123. */
const ISSUE_KEY = /\b[A-Z][A-Z0-9]{1,}-\d+\b/g

export function isValidIssueKey(value: string): boolean {
  const single = /^[A-Z][A-Z0-9]{1,}-\d+$/
  return single.test(value.trim())
}

/**
 * Scan the given text fragments for a key-shaped hint. Returns the FIRST match.
 * The hint is non-authoritative — the Issue Key and the OpenForge Task id can
 * look identical yet be unrelated (see CONTEXT.md), so callers must treat this
 * only as a pre-fill the user confirms.
 */
export function extractIssueKeyHint(...texts: Array<string | null | undefined>): string | null {
  for (const text of texts) {
    if (!text) continue
    const match = text.match(ISSUE_KEY)
    if (match && match.length > 0) return match[0]
  }
  return null
}

export type JqlValidation =
  | { ok: true; jql: string }
  | { ok: false; message: string }

/**
 * Client-side JQL guard. The backend/Jira does the real parsing (a 400 comes
 * back as `invalid-jql`); here we only reject what is pointless to send: an
 * empty query.
 */
export function validateJql(input: string): JqlValidation {
  const jql = input.trim()
  if (jql.length === 0) return { ok: false, message: 'Enter a JQL query to search.' }
  return { ok: true, jql }
}
