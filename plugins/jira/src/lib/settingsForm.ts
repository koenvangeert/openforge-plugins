// Pure validation/merge used only by the backend settings method. Keeping the
// "leave the token blank to keep the existing one" branch behind that method
// prevents stored tokens from crossing into renderer memory.

import type { JiraCredentials } from './credentials'
import { normalizeSite } from './credentials'

export interface CredentialFormInput {
  site: string
  email: string
  /** What the user typed into the token field; blank means "keep existing". */
  apiToken: string
}

export interface JiraSettingsSnapshot {
  site: string
  email: string
  hasStoredToken: boolean
}

export type SaveSettingsResult =
  | { ok: true; settings: JiraSettingsSnapshot }
  | { ok: false; message: string }

export type CredentialFormResult =
  | { ok: true; credentials: JiraCredentials }
  | { ok: false; message: string }

/**
 * Build the credentials to persist from the form input. When the token field is
 * blank, `existingToken` is kept; if there is also no existing token, that is an
 * error. Site and email are validated/normalized.
 */
export function buildCredentialsToStore(input: CredentialFormInput, existingToken: string | null): CredentialFormResult {
  const site = normalizeSite(input.site)
  if (!site) return { ok: false, message: 'Enter a valid Jira site, e.g. acme.atlassian.net.' }

  const email = input.email.trim()
  if (email.length === 0) return { ok: false, message: 'Enter the account email.' }

  const typed = input.apiToken.trim()
  const apiToken = typed.length > 0 ? typed : (existingToken ?? '').trim()
  if (apiToken.length === 0) return { ok: false, message: 'Enter an API token.' }

  return { ok: true, credentials: { site, email, apiToken } }
}
