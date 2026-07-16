// Jira Cloud credentials. Stored in storage.global as plaintext JSON and read
// ONLY in the backend for settings persistence and HTTP (see docs/adr/0002).
// The renderer receives only redacted settings metadata.

export interface JiraCredentials {
  /** Normalized origin, e.g. https://acme.atlassian.net (no trailing slash, no path). */
  site: string
  email: string
  apiToken: string
}

/**
 * Normalize a user-entered site into a bare https origin: strips whitespace,
 * FORCES https (a plain-http site would send Basic-auth credentials in the
 * clear), and drops any protocol/path/query/trailing slash so REST paths can be
 * appended directly. Returns null when nothing usable remains.
 */
export function normalizeSite(input: string): string | null {
  const withoutProtocol = input.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  if (withoutProtocol.length === 0) return null
  try {
    const url = new URL(`https://${withoutProtocol}`)
    return `https://${url.host}`
  } catch {
    return null
  }
}

/**
 * Validate and normalize raw stored/entered credential data. Returns null when
 * any of site/email/apiToken is missing or blank, or the site is unusable.
 */
export function normalizeCredentials(raw: unknown): JiraCredentials | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const email = typeof record.email === 'string' ? record.email.trim() : ''
  const apiToken = typeof record.apiToken === 'string' ? record.apiToken.trim() : ''
  const site = typeof record.site === 'string' ? normalizeSite(record.site) : null
  if (!site || email.length === 0 || apiToken.length === 0) return null
  return { site, email, apiToken }
}
