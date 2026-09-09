import { agentSession } from './__fixtures__/agentSession'
import { describe, expect, it } from 'vitest'
import { createMockBackendOpenForgeApi, createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import type { PluginCommandInvocationContext } from '@openforge-app/plugin-sdk'
import backendPlugin from './backend'
import {
  danglingReferenceGraphDocInput,
  schemaInvalidGraphDocInput,
  validGraphDocInput,
} from './__fixtures__/graphDoc'
import { saveDiagram } from './prLensCommands'
import { DIAGRAM_UPDATED_EVENT, loadStoredDiagram, saveStoredDiagram, type StoredDiagram } from './prLensStorage'

const AGENT_CLI: PluginCommandInvocationContext = {
  taskId: 'T-1',
  projectId: 'P-1',
  source: 'agent-cli',
}

function backendApi() {
  return createMockBackendOpenForgeApi({
    pluginId: 'dev.kvg.pr-lens',
    projectId: 'P-1',
    taskId: 'T-1',
    agentSessions: [agentSession('S-1', 'T-1', 100), agentSession('S-2', 'T-1', 200)],
  })
}

describe('save-diagram registration', () => {
  it('is exposed to agents under its qualified id', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.pr-lens', projectId: 'P-1' })

    await registry.activateBackend(backendPlugin)

    expect(registry.snapshot.commands).toMatchObject([
      { id: 'save-diagram', qualifiedId: 'dev.kvg.pr-lens.save-diagram' },
    ])
    expect(registry.snapshot.commands[0].agent?.description).toBeTruthy()
  })
})

describe('save-diagram handler', () => {
  it('stores a valid document and reports what it stored', async () => {
    const api = backendApi()

    const result = await saveDiagram(api, { document: validGraphDocInput() }, AGENT_CLI)

    expect(result).toMatchObject({ status: 'stored', taskId: 'T-1', title: 'Add the PR Lens task tab' })
    expect((await loadStoredDiagram(api.storage, 'T-1'))?.document.title).toBe('Add the PR Lens task tab')
  })

  it('stamps the newest session, the store time, and the reported cleanliness', async () => {
    const api = backendApi()

    await saveDiagram(api, { document: validGraphDocInput(), cleanliness: 'dirty' }, AGENT_CLI)

    const stored = await loadStoredDiagram(api.storage, 'T-1')
    expect(stored?.sessionId).toBe('S-2')
    expect(stored?.cleanliness).toBe('dirty')
    expect(stored?.storedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/)
  })

  it('records unreported cleanliness as null rather than clean', async () => {
    const api = backendApi()

    await saveDiagram(api, { document: validGraphDocInput() }, AGENT_CLI)

    expect((await loadStoredDiagram(api.storage, 'T-1'))?.cleanliness).toBeNull()
  })

  it('rejects a schema-invalid document with the failing paths', async () => {
    const api = backendApi()

    await expect(saveDiagram(api, { document: schemaInvalidGraphDocInput() }, AGENT_CLI))
      .rejects.toThrow(/provenance/)
  })

  it('rejects an edge pointing at an undeclared node', async () => {
    const api = backendApi()

    await expect(saveDiagram(api, { document: danglingReferenceGraphDocInput() }, AGENT_CLI))
      .rejects.toThrow(/absent/)
  })

  it('keeps the previous diagram when validation fails', async () => {
    const api = backendApi()
    const existing: StoredDiagram = {
      document: validGraphDocInput() as StoredDiagram['document'],
      sessionId: 'S-1',
      storedAt: '2026-09-09T08:00:00.000Z',
      cleanliness: 'clean',
    }
    await saveStoredDiagram(api.storage, 'T-1', existing)

    await expect(saveDiagram(api, { document: schemaInvalidGraphDocInput() }, AGENT_CLI)).rejects.toThrow()

    expect(await loadStoredDiagram(api.storage, 'T-1')).toEqual(existing)
  })

  it('refuses to run without task context', async () => {
    const api = createMockBackendOpenForgeApi({ pluginId: 'dev.kvg.pr-lens', projectId: 'P-1', taskId: null })

    await expect(saveDiagram(api, { document: validGraphDocInput() }, { taskId: null, projectId: 'P-1', source: 'agent-cli' }))
      .rejects.toThrow(/Task context/)
  })

  it('announces the update so open views repaint', async () => {
    const api = backendApi()
    const seen: unknown[] = []
    api.events.on(DIAGRAM_UPDATED_EVENT, (payload) => { seen.push(payload) })

    await saveDiagram(api, { document: validGraphDocInput() }, AGENT_CLI)

    expect(seen).toEqual([{ taskId: 'T-1' }])
  })
})
