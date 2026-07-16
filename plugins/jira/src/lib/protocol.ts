// Shared constants for the frontend<->backend contract and storage layout.
// Kept in one place so the renderer surfaces and the backend never drift.

/** Backend method names (registered via backend.registerMethod, called via api.backend.invoke). */
export const METHOD = {
  getIssue: 'getIssue',
  getSettings: 'getSettings',
  saveSettings: 'saveSettings',
  search: 'search',
  testConnection: 'testConnection',
} as const

/** Keys under storage.global. */
export const GLOBAL_KEY = {
  credentials: 'credentials',
  lastJql: 'lastJql',
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
