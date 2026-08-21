// Frontend controller for the Linked Issue Section: the Task<->Issue link, the
// non-authoritative auto-suggestion, and loading an issue through the backend.
// The renderer never calls Jira directly — it goes via api.backend.invoke.

import type { JsonValue } from '@openforge-app/plugin-sdk'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { sanitizeHtml } from '@openforge-app/plugin-sdk/sanitize'
import { extractIssueKeyHint } from './issueKey'
import type { IssueResult, JiraIssue } from './jiraTypes'
import { invokeJiraBackend, TASK_KEY } from './protocol'

type Api = Pick<FrontendOpenForgeAPI, 'storage' | 'backend' | 'tasks'>
type StorageApi = Pick<FrontendOpenForgeAPI, 'storage'>
type TasksApi = Pick<FrontendOpenForgeAPI, 'tasks'>

export interface LinkedIssueSnapshot {
  issue: JiraIssue
  /** ISO-8601 timestamp for the most recent successful Jira read. */
  refreshedAt: string | null
}

export type LinkedIssueResult =
  | { ok: true; issue: JiraIssue; refreshedAt: string }
  | Extract<IssueResult, { ok: false }>

function toJson(value: unknown): JsonValue {
  return value as JsonValue
}

/** Read the explicit Issue Key linked to this task, or null when unlinked. */
export async function readLinkedKey(api: StorageApi, taskId: string): Promise<string | null> {
  const raw = await api.storage.task(taskId).get(TASK_KEY.link)
  if (raw && typeof raw === 'object' && 'key' in raw) {
    const key = (raw as { key: unknown }).key
    if (typeof key === 'string' && key.length > 0) return key
  }
  return null
}

export async function saveLinkedKey(api: StorageApi, taskId: string, key: string): Promise<void> {
  await api.storage.task(taskId).set(TASK_KEY.link, toJson({ key }))
}

/** Remove the link and any cached issue for this task. */
export async function clearLink(api: StorageApi, taskId: string): Promise<void> {
  await api.storage.task(taskId).delete(TASK_KEY.link)
  await api.storage.task(taskId).delete(TASK_KEY.cachedIssue)
}

/**
 * Scan the task's own text (initial_prompt + title) for a key-shaped hint.
 * Non-authoritative — the caller offers it as a pre-fill the user confirms.
 * Returns null if the task can't be read or no hint is present.
 */
export async function suggestIssueKey(api: TasksApi, taskId: string): Promise<string | null> {
  try {
    const task = await api.tasks.get(taskId)
    if (!task) return null
    return extractIssueKeyHint(task.initial_prompt, task.title)
  } catch {
    return null
  }
}

/** The last successfully loaded issue for instant paint before a refresh. */
export async function readCachedIssue(api: StorageApi, taskId: string): Promise<LinkedIssueSnapshot | null> {
  const raw = await api.storage.task(taskId).get(TASK_KEY.cachedIssue)
  if (!raw || typeof raw !== 'object') return null

  // Current cache shape. The Issue itself stays the shared Jira read model.
  if ('issue' in raw && raw.issue && typeof raw.issue === 'object') {
    const refreshedAt = 'refreshedAt' in raw && typeof raw.refreshedAt === 'string'
      ? raw.refreshedAt
      : null
    return { issue: raw.issue as unknown as JiraIssue, refreshedAt }
  }

  // Legacy builds cached the JiraIssue directly. Read it once so existing
  // installs can paint immediately, then replace it on the automatic refresh.
  if ('key' in raw && typeof raw.key === 'string') {
    return { issue: raw as unknown as JiraIssue, refreshedAt: null }
  }
  return null
}

/**
 * Load an issue through the backend, sanitize its description HTML in the
 * renderer (DOMPurify needs a DOM; the backend can't run it), and cache the
 * sanitized result. On failure the backend's typed error is returned as-is.
 */
export async function loadIssue(api: Api, taskId: string, key: string): Promise<LinkedIssueResult> {
  const result = await invokeJiraBackend(api.backend, 'getIssue', { key })
  if (!result.ok) return result
  const issue: JiraIssue = { ...result.issue, descriptionHtml: sanitizeHtml(result.issue.descriptionHtml) }
  const refreshedAt = new Date().toISOString()
  await api.storage.task(taskId).set(TASK_KEY.cachedIssue, toJson({ issue, refreshedAt }))
  return { ok: true, issue, refreshedAt }
}
