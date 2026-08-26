import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import { describe, expect, it } from 'vitest'
import backendPlugin from './backend'
import {
  getHandoffNotes,
  HANDOFF_NOTES_COMMAND_IDS,
  updateHandoffNotes,
} from './handoffNotesCommands'
import { saveHandoffNotesSettings } from './handoffNotesSettings'
import {
  HANDOFF_NOTES_STORAGE_KEY,
  HANDOFF_NOTES_UPDATED_EVENT,
} from './handoffNotesStorage'

const INVOCATION = {
  taskId: 'KVG-1810',
  projectId: 'P-8',
  source: 'agent-cli' as const,
}

describe('agent-facing Handoff Notes commands', () => {
  it('registers hidden backend commands with agent metadata', async () => {
    const registry = createOpenForgeRegistryFake({
      pluginId: 'com.openforge.handoff-notes-workflow',
      projectId: 'P-8',
      taskId: 'KVG-1810',
    })

    await registry.activateBackend(backendPlugin)

    expect(registry.snapshot.commands).toMatchObject([
      {
        id: HANDOFF_NOTES_COMMAND_IDS.get,
        title: 'Get Handoff Notes',
        discoverable: false,
        agent: {
          description: expect.stringContaining('Read the agent-maintained Handoff Notes'),
        },
      },
      {
        id: HANDOFF_NOTES_COMMAND_IDS.update,
        title: 'Update Handoff Notes',
        discoverable: false,
        agent: {
          description: expect.stringContaining('meaningful handoffs'),
        },
      },
    ])
  })

  it('supplies Task and Project invocation context through the SDK command fake', async () => {
    const registry = createOpenForgeRegistryFake({
      pluginId: 'com.openforge.handoff-notes-workflow',
      projectId: 'P-8',
      taskId: 'KVG-1810',
    })
    await registry.activateBackend(backendPlugin)

    await expect(registry.backendApi.commands.invoke(HANDOFF_NOTES_COMMAND_IDS.get)).resolves.toEqual({
      status: 'empty',
      taskId: 'KVG-1810',
      notes: '',
    })
  })

  it('returns empty and stored task-scoped notes', async () => {
    const registry = createOpenForgeRegistryFake({ projectId: 'P-8', taskId: 'KVG-1810' })

    await expect(getHandoffNotes(registry.backendApi, INVOCATION)).resolves.toEqual({
      status: 'empty',
      taskId: 'KVG-1810',
      notes: '',
    })

    await registry.backendApi.storage.task('KVG-1810').set(
      HANDOFF_NOTES_STORAGE_KEY,
      '## What is built\n- Existing context',
    )

    await expect(getHandoffNotes(registry.backendApi, INVOCATION)).resolves.toEqual({
      status: 'ready',
      taskId: 'KVG-1810',
      notes: '## What is built\n- Existing context',
    })
  })

  it('stores a complete replacement and announces the automatic UI update', async () => {
    const registry = createOpenForgeRegistryFake({ projectId: 'P-8', taskId: 'KVG-1810' })
    const updates: unknown[] = []
    registry.frontendApi.events.on(HANDOFF_NOTES_UPDATED_EVENT, (payload) => updates.push(payload))
    const notes = `
## Open Questions
None.

## What is built
- Handoff Notes are agent maintained.

## Follow-up task
None.
`

    await expect(updateHandoffNotes(registry.backendApi, { notes }, INVOCATION)).resolves.toEqual({
      status: 'updated',
      taskId: 'KVG-1810',
      notes: notes.trim(),
      validationStatus: 'complete',
      validationMessage: 'All template headings are present.',
    })

    expect(registry.calls.storageSets).toContainEqual({
      scope: 'task',
      scopeId: 'KVG-1810',
      key: HANDOFF_NOTES_STORAGE_KEY,
      value: notes.trim(),
    })
    expect(updates).toEqual([{ taskId: 'KVG-1810' }])
  })

  it('validates updates against the custom project template', async () => {
    const registry = createOpenForgeRegistryFake({ projectId: 'P-8', taskId: 'KVG-1810' })
    await saveHandoffNotesSettings(registry.frontendApi.tasks, 'P-8', {
      template: '## Summary\nOutcome.\n\n## Verification\nChecks run.',
    })

    await expect(updateHandoffNotes(registry.backendApi, {
      notes: '## Summary\nComplete.\n\n## Verification\n- Tests pass.',
    }, INVOCATION)).resolves.toMatchObject({
      validationStatus: 'complete',
      validationMessage: 'All template headings are present.',
    })
  })

  it('rejects blank notes and missing Task context', async () => {
    const registry = createOpenForgeRegistryFake({ projectId: 'P-8', taskId: null })

    await expect(updateHandoffNotes(registry.backendApi, { notes: '   ' }, INVOCATION))
      .rejects.toThrow('Handoff Notes must be non-empty Markdown.')
    await expect(getHandoffNotes(registry.backendApi, {
      taskId: null,
      projectId: 'P-8',
      source: 'agent-cli',
    })).rejects.toThrow('Handoff Notes commands require OpenForge Task context.')
    expect(registry.calls.storageSets).toEqual([])
  })
})
