import { render } from '@testing-library/svelte'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { vi } from 'vitest'
import IssuesView from './IssuesView.svelte'

export type InvokeHandlers = Record<string, (payload: unknown) => Promise<unknown>>

export function createIssuesViewApi(handlers: InvokeHandlers) {
  const invoke = vi.fn(async (method: string, payload?: unknown) => {
    // Match Electron IPC semantics so tests reject Svelte proxies and other
    // values that cannot cross the structured-clone boundary.
    const clonedPayload = structuredClone(payload)
    const handler = handlers[method]
    if (!handler) return null
    return handler(clonedPayload)
  })
  const api = {
    backend: {
      state: 'ready' as const,
      whenReady: async () => undefined,
      onReady: (handler: () => void) => {
        handler()
        return { dispose: () => undefined }
      },
      invoke,
    },
    system: { openUrl: vi.fn(async () => undefined) },
    projectConfig: { get: vi.fn(async () => null) },
  }

  return { api: api as unknown as FrontendOpenForgeAPI, invoke }
}

export function renderIssuesView(handlers: InvokeHandlers) {
  const { api, invoke } = createIssuesViewApi(handlers)
  const rendered = render(IssuesView, {
    props: { api, projectId: 'proj-1', projectName: 'Cat' },
  })

  return { api, invoke, rerender: rendered.rerender }
}
