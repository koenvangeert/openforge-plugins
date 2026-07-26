import { describe, expect, it, vi } from 'vitest'
import { createIssuesViewApi } from './IssuesView.testUtils'

describe('IssuesView test API', () => {
  it('structured-clones backend payloads before dispatching them to handlers', async () => {
    let dispatchedPayload: unknown
    const handler = vi.fn(async (receivedPayload: unknown) => {
      dispatchedPayload = receivedPayload
      return null
    })
    const { invoke } = createIssuesViewApi({ issues_test: handler })
    const payload = { projectId: 'proj-1', labels: ['alpha'] }

    await invoke('issues_test', payload)

    expect(handler).toHaveBeenCalledWith(payload)
    const clonedPayload = dispatchedPayload as typeof payload
    expect(clonedPayload).not.toBe(payload)
    expect(clonedPayload.labels).not.toBe(payload.labels)
  })

  it('rejects non-cloneable backend payloads before dispatch', async () => {
    const handler = vi.fn(async () => null)
    const { invoke } = createIssuesViewApi({ issues_test: handler })

    await expect(invoke('issues_test', { callback: () => undefined })).rejects.toThrow()
    expect(handler).not.toHaveBeenCalled()
  })
})
