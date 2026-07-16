import { defineBackendPlugin } from '@openforge-app/plugin-sdk/backend'
import type { BackendOpenForgeAPI } from '@openforge-app/plugin-sdk/backend'
import { normalizeCredentials } from './lib/credentials'
import type { JiraCredentials } from './lib/credentials'
import { fetchIssue, searchIssues, testConnection } from './lib/jiraClient'
import { isValidIssueKey } from './lib/issueKey'
import { GLOBAL_KEY, METHOD } from './lib/protocol'
import type { JiraBackendInput, JiraBackendOutput } from './lib/protocol'
import { buildCredentialsToStore } from './lib/settingsForm'
import type { JiraSettingsSnapshot } from './lib/settingsForm'

// The backend owns every Jira HTTP call and is the only place the API token is
// read (docs/adr/0002). Credentials are re-read on each call so a settings edit
// takes effect immediately without a reload.
async function readCredentials(openforge: BackendOpenForgeAPI): Promise<JiraCredentials | null> {
  const raw = await openforge.storage.global.get(GLOBAL_KEY.credentials)
  return normalizeCredentials(raw)
}

function toSettingsSnapshot(credentials: JiraCredentials | null): JiraSettingsSnapshot {
  return credentials
    ? { site: credentials.site, email: credentials.email, hasStoredToken: true }
    : { site: '', email: '', hasStoredToken: false }
}

const NO_CREDENTIALS_MESSAGE = 'Add your Jira site, email and API token in the Jira settings.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export default defineBackendPlugin({
  activate(openforge, context) {
    context.subscriptions.add(
      openforge.backend.registerMethod<
        JiraBackendInput<'getSettings'>,
        JiraBackendOutput<'getSettings'>
      >(METHOD.getSettings, {
        handler: async () => toSettingsSnapshot(await readCredentials(openforge)),
      }),
    )

    context.subscriptions.add(
      openforge.backend.registerMethod<
        JiraBackendInput<'saveSettings'>,
        JiraBackendOutput<'saveSettings'>
      >(METHOD.saveSettings, {
        handler: async (input) => {
          const existing = await readCredentials(openforge)
          const result = buildCredentialsToStore(input, existing?.apiToken ?? null)
          if (!result.ok) return result

          await openforge.storage.global.set(GLOBAL_KEY.credentials, {
            site: result.credentials.site,
            email: result.credentials.email,
            apiToken: result.credentials.apiToken,
          })
          return {
            ok: true,
            settings: toSettingsSnapshot(result.credentials),
          }
        },
      }),
    )

    context.subscriptions.add(
      openforge.backend.registerMethod<unknown, JiraBackendOutput<'getIssue'>>(METHOD.getIssue, {
        input: {
          type: 'object',
          required: ['key'],
          properties: { key: { type: 'string' } },
        },
        handler: async (input) => {
          const key = isRecord(input) ? input.key : null
          const normalized = typeof key === 'string' ? key.trim().toUpperCase() : ''
          if (!isValidIssueKey(normalized)) {
            return { ok: false, error: 'invalid-key', message: 'Enter a valid issue key like PROJ-123.' }
          }
          const creds = await readCredentials(openforge)
          if (!creds) return { ok: false, error: 'no-credentials', message: NO_CREDENTIALS_MESSAGE }
          return fetchIssue(creds, normalized)
        },
      }),
    )

    context.subscriptions.add(
      openforge.backend.registerMethod<unknown, JiraBackendOutput<'search'>>(METHOD.search, {
        input: {
          type: 'object',
          required: ['jql'],
          properties: {
            jql: { type: 'string' },
            nextPageToken: { type: ['string', 'null'] },
          },
        },
        handler: async (input) => {
          const jql = isRecord(input) ? input.jql : null
          const nextPageToken = isRecord(input) ? input.nextPageToken : null
          const trimmed = typeof jql === 'string' ? jql.trim() : ''
          if (trimmed.length === 0) {
            return { ok: false, error: 'invalid-jql', message: 'No JQL query was provided.' }
          }
          const creds = await readCredentials(openforge)
          if (!creds) return { ok: false, error: 'no-credentials', message: NO_CREDENTIALS_MESSAGE }
          return searchIssues(creds, {
            jql: trimmed,
            nextPageToken: typeof nextPageToken === 'string' ? nextPageToken.trim() || null : null,
          })
        },
      }),
    )

    context.subscriptions.add(
      openforge.backend.registerMethod<
        JiraBackendInput<'testConnection'>,
        JiraBackendOutput<'testConnection'>
      >(METHOD.testConnection, {
        handler: async () => {
          const creds = await readCredentials(openforge)
          if (!creds) return { ok: false, error: 'no-credentials', message: NO_CREDENTIALS_MESSAGE }
          return testConnection(creds)
        },
      }),
    )
  },
})
