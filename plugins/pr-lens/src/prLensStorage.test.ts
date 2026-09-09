import { describe, expect, it } from 'vitest'
import { createMockOpenForgeApi } from '@openforge-app/plugin-sdk/testing'
import { validGraphDocInput } from './__fixtures__/graphDoc'
import { loadStoredDiagram, saveStoredDiagram, type StoredDiagram } from './prLensStorage'

function diagram(overrides: Partial<StoredDiagram> = {}): StoredDiagram {
  return {
    document: validGraphDocInput() as StoredDiagram['document'],
    sessionId: 'S-1',
    storedAt: '2026-09-09T08:00:00.000Z',
    cleanliness: 'clean',
    ...overrides,
  }
}

describe('stored diagram', () => {
  it('reads back nothing for a task that has none', async () => {
    const api = createMockOpenForgeApi({ pluginId: 'dev.kvg.pr-lens' })

    expect(await loadStoredDiagram(api.storage, 'T-1')).toBeNull()
  })

  it('reads back what was written', async () => {
    const api = createMockOpenForgeApi({ pluginId: 'dev.kvg.pr-lens' })

    await saveStoredDiagram(api.storage, 'T-1', diagram())

    expect(await loadStoredDiagram(api.storage, 'T-1')).toEqual(diagram())
  })

  it('replaces the previous diagram rather than keeping history', async () => {
    const api = createMockOpenForgeApi({ pluginId: 'dev.kvg.pr-lens' })

    await saveStoredDiagram(api.storage, 'T-1', diagram({ storedAt: '2026-09-09T08:00:00.000Z' }))
    await saveStoredDiagram(api.storage, 'T-1', diagram({ storedAt: '2026-09-09T09:00:00.000Z' }))

    const stored = await loadStoredDiagram(api.storage, 'T-1')
    expect(stored?.storedAt).toBe('2026-09-09T09:00:00.000Z')
  })

  it('keeps one task diagram out of another task', async () => {
    const api = createMockOpenForgeApi({ pluginId: 'dev.kvg.pr-lens' })

    await saveStoredDiagram(api.storage, 'T-1', diagram())

    expect(await loadStoredDiagram(api.storage, 'T-2')).toBeNull()
  })
})
