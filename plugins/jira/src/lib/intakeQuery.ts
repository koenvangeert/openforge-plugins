import type { JsonValue } from '@openforge-app/plugin-sdk'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { PROJECT_KEY } from './protocol'

type Api = Pick<FrontendOpenForgeAPI, 'storage'>

/** The JQL a Project's Intake Workspace opens with until the user applies their own. */
export const DEFAULT_INTAKE_JQL =
  'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeIntakeQuery(raw: unknown): string {
  if (isRecord(raw) && typeof raw.jql === 'string' && raw.jql.trim().length > 0) return raw.jql
  return DEFAULT_INTAKE_JQL
}

function toJson(jql: string): JsonValue {
  return { jql }
}

/** Read the Project's persisted Intake JQL, repairing a missing or malformed value to the default. */
export async function readIntakeQuery(api: Api, projectId: string): Promise<string> {
  const store = api.storage.project(projectId)
  const raw = await store.get(PROJECT_KEY.intakeQuery)
  const jql = normalizeIntakeQuery(raw)
  if (!isRecord(raw) || raw.jql !== jql) {
    await store.set(PROJECT_KEY.intakeQuery, toJson(jql))
  }
  return jql
}

/** Persist the Project's Intake JQL. Rejects a blank query so the workspace never loses its query. */
export async function saveIntakeQuery(api: Api, projectId: string, jql: string): Promise<string> {
  const trimmed = jql.trim()
  if (trimmed.length === 0) throw new Error('The Intake JQL query must not be empty.')
  await api.storage.project(projectId).set(PROJECT_KEY.intakeQuery, toJson(trimmed))
  return trimmed
}
