// Frontend controller for the rail view: the remembered JQL and running a
// search through the backend.

import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { validateJql } from './issueKey'
import type { SearchResult } from './jiraTypes'
import { GLOBAL_KEY, METHOD } from './protocol'

type Api = Pick<FrontendOpenForgeAPI, 'storage' | 'backend'>

/** The last JQL the user ran, remembered across sessions in storage.global. */
export async function readLastJql(api: Api): Promise<string> {
  const raw = await api.storage.global.get(GLOBAL_KEY.lastJql)
  return typeof raw === 'string' ? raw : ''
}

/**
 * Validate the JQL, remember it, and run the search through the backend.
 * Empty/whitespace queries fail fast as `invalid-jql` without a round-trip;
 * Jira's own parse errors come back as `invalid-jql` from the backend.
 */
export async function runQuery(api: Api, input: string): Promise<SearchResult> {
  const validation = validateJql(input)
  if (!validation.ok) return { ok: false, error: 'invalid-jql', message: validation.message }
  await api.storage.global.set(GLOBAL_KEY.lastJql, validation.jql)
  await api.backend.whenReady()
  return api.backend.invoke<SearchResult>(METHOD.search, { jql: validation.jql })
}
