import type { Task } from '@openforge-app/plugin-sdk'
import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import { describe, expect, it, vi } from 'vitest'
import {
  extractHandoffNotesHeadings,
  loadHandoffNotes,
  validateHandoffNotes,
} from './handoffNotes'
import { DEFAULT_HANDOFF_NOTES_TEMPLATE } from './handoffNotesSettings'
import { HANDOFF_NOTES_STORAGE_KEY } from './handoffNotesStorage'

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'KVG-1808',
    initial_prompt: 'Build the task viewer',
    prompt: null,
    status: 'doing',
    project_id: 'P-8',
    ...overrides,
  } as Task
}

describe('Handoff Notes task storage', () => {
  it('loads notes from task-scoped plugin storage', async () => {
    const registry = createOpenForgeRegistryFake({ projectId: 'P-8', taskId: 'KVG-1808' })
    registry.frontendApi.tasks.get = vi.fn(async () => task())
    await registry.frontendApi.storage.task('KVG-1808').set(
      HANDOFF_NOTES_STORAGE_KEY,
      '## What is built\n- Agent-maintained notes',
    )

    await expect(loadHandoffNotes(registry.frontendApi, 'KVG-1808', 'P-8')).resolves.toEqual({
      status: 'ready',
      notes: '## What is built\n- Agent-maintained notes',
    })
    expect(registry.calls.storageGets.at(-1)).toEqual({
      scope: 'task',
      scopeId: 'KVG-1808',
      key: HANDOFF_NOTES_STORAGE_KEY,
    })
  })

  it('returns empty notes when the agent has not contributed them yet', async () => {
    const registry = createOpenForgeRegistryFake({ projectId: 'P-8', taskId: 'KVG-1808' })
    registry.frontendApi.tasks.get = vi.fn(async () => task())

    await expect(loadHandoffNotes(registry.frontendApi, 'KVG-1808', 'P-8')).resolves.toEqual({
      status: 'ready',
      notes: '',
    })
  })

  it('loads both read-only Task views without reading project template settings', async () => {
    const registry = createOpenForgeRegistryFake({ projectId: 'P-8', taskId: 'KVG-1808' })
    const listStartPromptContributions = vi.fn(async () => [])
    registry.frontendApi.tasks.get = vi.fn(async () => task())
    registry.frontendApi.tasks.listStartPromptContributions = listStartPromptContributions
    await registry.frontendApi.storage.task('KVG-1808').set(
      HANDOFF_NOTES_STORAGE_KEY,
      '## What is built\n- Agent-maintained notes',
    )

    const [taskInformationResult, taskTabResult] = await Promise.all([
      loadHandoffNotes(registry.frontendApi, 'KVG-1808', 'P-8'),
      loadHandoffNotes(registry.frontendApi, 'KVG-1808', 'P-8'),
    ])

    expect(taskInformationResult).toEqual({
      status: 'ready',
      notes: '## What is built\n- Agent-maintained notes',
    })
    expect(taskTabResult).toEqual(taskInformationResult)
    expect(listStartPromptContributions).not.toHaveBeenCalled()
  })

  it('reports unavailable project context without reading task storage', async () => {
    const registry = createOpenForgeRegistryFake({ projectId: null, taskId: 'KVG-1808' })
    const getTask = vi.fn(async () => task())
    registry.frontendApi.tasks.get = getTask

    await expect(loadHandoffNotes(registry.frontendApi, 'KVG-1808', null)).resolves.toEqual({
      status: 'unavailable',
      message: 'Open this task in an enabled project to view its Handoff Notes.',
    })
    expect(getTask).not.toHaveBeenCalled()
    expect(registry.calls.storageGets).toEqual([])
  })

  it('rejects a missing task or a task from another project', async () => {
    const registry = createOpenForgeRegistryFake({ projectId: 'P-8', taskId: 'KVG-1808' })
    registry.frontendApi.tasks.get = vi.fn(async () => task({ project_id: 'P-9' }))

    await expect(loadHandoffNotes(registry.frontendApi, 'KVG-1808', 'P-8'))
      .rejects.toThrow('Task KVG-1808 is no longer available in this project.')
  })
})

describe('Handoff Notes validation', () => {
  it('reports empty notes and every heading from the template', () => {
    const requiredHeadings = extractHandoffNotesHeadings(DEFAULT_HANDOFF_NOTES_TEMPLATE)

    expect(validateHandoffNotes('', DEFAULT_HANDOFF_NOTES_TEMPLATE)).toEqual({
      status: 'empty',
      message: 'No Handoff Notes yet.',
      missingHeadings: requiredHeadings,
    })
  })

  it('reports only missing template headings', () => {
    expect(validateHandoffNotes(`# OPEN QUESTIONS
None.`, DEFAULT_HANDOFF_NOTES_TEMPLATE)).toEqual({
      status: 'incomplete',
      message: 'Missing template headings: What is built, Follow-up task.',
      missingHeadings: ['What is built', 'Follow-up task'],
    })
  })

  it('recognizes a complete reviewer brief for the default template', () => {
    const notes = `
## Open Questions
None.

## What is built
- Reviewers can use the updated handoff format.

## Follow-up task
None.
`

    expect(validateHandoffNotes(notes, DEFAULT_HANDOFF_NOTES_TEMPLATE)).toEqual({
      status: 'complete',
      message: 'All template headings are present.',
      missingHeadings: [],
    })
  })

  it('uses custom template headings instead of default headings', () => {
    const template = `## Summary
Keep this concise.

### Verification
List the checks performed.`
    const notes = `# SUMMARY ###
The workflow uses the project configuration.

#### verification
- Custom headings are accepted.`

    expect(validateHandoffNotes(notes, template)).toEqual({
      status: 'complete',
      message: 'All template headings are present.',
      missingHeadings: [],
    })
  })
})
