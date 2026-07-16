// Shared constants for the frontend<->backend contract and storage layout.
// Kept in one place so the renderer surfaces and the backend never drift.

import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import type { GetIssueRequest, IssueResult, SearchIssuesRequest, SearchResult, TestConnectionResult } from './jiraTypes'
import type { CredentialFormInput, JiraSettingsSnapshot, SaveSettingsResult } from './settingsForm'

export interface JiraBackendContract {
  getIssue: { input: GetIssueRequest; output: IssueResult }
  getSettings: { input: null; output: JiraSettingsSnapshot }
  saveSettings: { input: CredentialFormInput; output: SaveSettingsResult }
  search: { input: SearchIssuesRequest; output: SearchResult }
  testConnection: { input: null; output: TestConnectionResult }
}

export type JiraBackendInput<TMethod extends keyof JiraBackendContract> = JiraBackendContract[TMethod]['input']
export type JiraBackendOutput<TMethod extends keyof JiraBackendContract> = JiraBackendContract[TMethod]['output']

export const METHOD = {
  getIssue: 'getIssue',
  getSettings: 'getSettings',
  saveSettings: 'saveSettings',
  search: 'search',
  testConnection: 'testConnection',
} as const satisfies { [TMethod in keyof JiraBackendContract]: TMethod }

export const HOST_EVENT = {
  navigationChanged: 'openforge.navigation-changed',
} as const

type JiraBackendBridge = Pick<FrontendOpenForgeAPI['backend'], 'invoke' | 'whenReady'>

export async function invokeJiraBackend<TMethod extends keyof JiraBackendContract>(
  backend: JiraBackendBridge,
  method: TMethod,
  input: JiraBackendInput<TMethod>,
): Promise<JiraBackendOutput<TMethod>> {
  await backend.whenReady()
  return backend.invoke<JiraBackendOutput<TMethod>>(method, input)
}

/** Keys under storage.global. */
export const GLOBAL_KEY = {
  credentials: 'credentials',
} as const

/** Keys under storage.project(projectId). */
export const PROJECT_KEY = {
  intakeFilters: 'intakeFilters',
} as const

/** Keys under storage.task(taskId). */
export const TASK_KEY = {
  /** The explicit Task<->Issue link: { key: string }. */
  link: 'link',
  /** Cached last successfully loaded issue JSON. */
  cachedIssue: 'cachedIssue',
} as const

/** Local plugin event fired by the Refresh command; both surfaces re-fetch on it. */
export const REFRESH_EVENT = 'refresh'
