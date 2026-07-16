import { defineBackendPlugin } from '@openforge-app/plugin-sdk/backend'
import type { BackendOpenForgeAPI } from '@openforge-app/plugin-sdk/backend'
import { normalizeCredentials } from './lib/credentials'
import type { JiraCredentials } from './lib/credentials'
import { fetchIssue, searchIssues, testConnection } from './lib/jiraClient'
import type { IssueResult, SearchResult, TestConnectionResult } from './lib/jiraTypes'
import { GLOBAL_KEY, METHOD } from './lib/protocol'

// The backend owns every Jira HTTP call and is the only place the API token is
// read (docs/adr/0002). Credentials are re-read on each call so a settings edit
// takes effect immediately without a reload.
async function readCredentials(openforge: BackendOpenForgeAPI): Promise<JiraCredentials | null> {
  const raw = await openforge.storage.global.get(GLOBAL_KEY.credentials)
  return normalizeCredentials(raw)
}

const NO_CREDENTIALS_MESSAGE = 'Add your Jira site, email and API token in the Jira settings.'

export default defineBackendPlugin({
  activate(openforge, context) {
    context.subscriptions.add(
      openforge.backend.registerMethod<{ key: string }, IssueResult>(METHOD.getIssue, {
        handler: async ({ key }) => {
          const trimmed = typeof key === 'string' ? key.trim() : ''
          if (trimmed.length === 0) {
            return { ok: false, error: 'not-found', message: 'No issue key was provided.' }
          }
          const creds = await readCredentials(openforge)
          if (!creds) return { ok: false, error: 'no-credentials', message: NO_CREDENTIALS_MESSAGE }
          return fetchIssue(creds, trimmed)
        },
      }),
    )

    context.subscriptions.add(
      openforge.backend.registerMethod<{ jql: string }, SearchResult>(METHOD.search, {
        handler: async ({ jql }) => {
          const trimmed = typeof jql === 'string' ? jql.trim() : ''
          if (trimmed.length === 0) {
            return { ok: false, error: 'invalid-jql', message: 'No JQL query was provided.' }
          }
          const creds = await readCredentials(openforge)
          if (!creds) return { ok: false, error: 'no-credentials', message: NO_CREDENTIALS_MESSAGE }
          return searchIssues(creds, trimmed)
        },
      }),
    )

    context.subscriptions.add(
      openforge.backend.registerMethod<null, TestConnectionResult>(METHOD.testConnection, {
        handler: async () => {
          const creds = await readCredentials(openforge)
          if (!creds) return { ok: false, error: 'no-credentials', message: NO_CREDENTIALS_MESSAGE }
          return testConnection(creds)
        },
      }),
    )
  },
})
