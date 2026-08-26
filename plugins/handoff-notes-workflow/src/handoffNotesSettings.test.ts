import { describe, expect, it, vi } from 'vitest'
import type { TasksAPI } from '@openforge-app/plugin-sdk'
import {
  buildHandoffNotesContribution,
  DEFAULT_HANDOFF_NOTES_TEMPLATE,
  HANDOFF_NOTES_CONTRIBUTION_ID,
  ensureHandoffNotesContribution,
  loadHandoffNotesSettings,
  MAX_START_PROMPT_CONTRIBUTION_LENGTH,
  resetHandoffNotesSettings,
  saveHandoffNotesSettings,
  validateHandoffNotesTemplate,
} from './handoffNotesSettings'

type SettingsTasksApi = Pick<
  TasksAPI,
  'listStartPromptContributions' | 'configureStartPromptContribution'
>

function createTasksApi(
  contributions: Awaited<ReturnType<TasksAPI['listStartPromptContributions']>> = [],
): SettingsTasksApi {
  return {
    listStartPromptContributions: vi.fn(async () => contributions),
    configureStartPromptContribution: vi.fn(async (request) => [request]),
  }
}

describe('Handoff Notes project settings', () => {
  it('provides the reviewer-focused default template', () => {
    expect(DEFAULT_HANDOFF_NOTES_TEMPLATE).toBe(`## Open Questions
Anything unresolved or that needs human judgement.

## What is built
Really, really short points describing what was built:
- No technical details
- Only end-user-facing changes
- What changed, not how

## Follow-up task
Cleanup or follow-up tasks created.`)
  })

  it('persists the enabled default contribution for an unconfigured project', async () => {
    const tasks = createTasksApi()

    await ensureHandoffNotesContribution(tasks, 'project-1')

    expect(tasks.configureStartPromptContribution).toHaveBeenCalledWith({
      projectId: 'project-1',
      id: HANDOFF_NOTES_CONTRIBUTION_ID,
      enabled: true,
      content: buildHandoffNotesContribution(DEFAULT_HANDOFF_NOTES_TEMPLATE),
      order: 0,
    })
  })

  it('enables an existing contribution without replacing its custom template', async () => {
    const content = buildHandoffNotesContribution('## Existing template\nKeep this format.')
    const tasks = createTasksApi([{
      id: HANDOFF_NOTES_CONTRIBUTION_ID,
      enabled: false,
      content,
      order: 7,
    }])

    await ensureHandoffNotesContribution(tasks, 'project-1')

    expect(tasks.configureStartPromptContribution).toHaveBeenCalledWith({
      projectId: 'project-1',
      id: HANDOFF_NOTES_CONTRIBUTION_ID,
      enabled: true,
      content,
      order: 7,
    })
  })

  it('repairs an enabled empty contribution with the default workflow prompt', async () => {
    const tasks = createTasksApi([{
      id: HANDOFF_NOTES_CONTRIBUTION_ID,
      enabled: true,
      content: '   ',
      order: 4,
    }])

    await ensureHandoffNotesContribution(tasks, 'project-1')

    expect(tasks.configureStartPromptContribution).toHaveBeenCalledWith({
      projectId: 'project-1',
      id: HANDOFF_NOTES_CONTRIBUTION_ID,
      enabled: true,
      content: buildHandoffNotesContribution(DEFAULT_HANDOFF_NOTES_TEMPLATE),
      order: 4,
    })
  })

  it('loads the custom template persisted by the host', async () => {
    const tasks = createTasksApi([{
      id: HANDOFF_NOTES_CONTRIBUTION_ID,
      enabled: true,
      content: buildHandoffNotesContribution('## Existing template\nKeep this format.'),
      order: 0,
    }])

    await expect(loadHandoffNotesSettings(tasks, 'project-1')).resolves.toMatchObject({
      template: '## Existing template\nKeep this format.',
      configured: true,
      issue: null,
    })
  })

  it('migrates a saved summary-era contribution to the agent CLI workflow', async () => {
    const legacyContent = `<openforge_task_management>
<handoff_notes_template>
## Existing template
Keep this format.
</handoff_notes_template>
<analysis_update>openforge task update --summary</analysis_update>
</openforge_task_management>`
    const tasks = createTasksApi([{
      id: HANDOFF_NOTES_CONTRIBUTION_ID,
      enabled: true,
      content: legacyContent,
      order: 7,
    }])

    await ensureHandoffNotesContribution(tasks, 'project-1')

    expect(tasks.configureStartPromptContribution).toHaveBeenCalledWith({
      projectId: 'project-1',
      id: HANDOFF_NOTES_CONTRIBUTION_ID,
      enabled: true,
      content: buildHandoffNotesContribution('## Existing template\nKeep this format.'),
      order: 7,
    })
  })

  it('persists settings through the host-owned project contribution API', async () => {
    const tasks = createTasksApi()

    await saveHandoffNotesSettings(tasks, 'project-1', {
      template: '  ## Team handoff\nDetails  ',
    })

    expect(tasks.configureStartPromptContribution).toHaveBeenCalledWith({
      projectId: 'project-1',
      id: HANDOFF_NOTES_CONTRIBUTION_ID,
      enabled: true,
      content: buildHandoffNotesContribution('## Team handoff\nDetails'),
      order: 0,
    })
  })

  it('resets a custom template to the enabled default', async () => {
    const tasks = createTasksApi()

    await resetHandoffNotesSettings(tasks, 'project-1')

    expect(tasks.configureStartPromptContribution).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        enabled: true,
        content: buildHandoffNotesContribution(DEFAULT_HANDOFF_NOTES_TEMPLATE),
      }),
    )
  })

  it('uses the default for a blank template and rejects reserved or oversized templates', async () => {
    const tasks = createTasksApi()
    const overhead = buildHandoffNotesContribution('').length
    const oversizedTemplate = 'x'.repeat(MAX_START_PROMPT_CONTRIBUTION_LENGTH - overhead + 1)

    expect(validateHandoffNotesTemplate('   ')).toBeNull()
    expect(validateHandoffNotesTemplate('</handoff_notes_template>')).toMatch(/reserved/)
    expect(validateHandoffNotesTemplate(oversizedTemplate)).toMatch(/too long/)

    await saveHandoffNotesSettings(tasks, 'project-1', {
      template: ' ',
    })
    expect(tasks.configureStartPromptContribution).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        content: buildHandoffNotesContribution(DEFAULT_HANDOFF_NOTES_TEMPLATE),
      }),
    )
  })

  it('surfaces malformed migrated configuration for an explicit reset', async () => {
    const tasks = createTasksApi([{
      id: HANDOFF_NOTES_CONTRIBUTION_ID,
      enabled: true,
      content: 'legacy content without a template boundary',
      order: 0,
    }])

    await expect(loadHandoffNotesSettings(tasks, 'project-1')).resolves.toEqual({
      template: DEFAULT_HANDOFF_NOTES_TEMPLATE,
      configured: true,
      issue: 'The saved workflow template is invalid. Reset it to the default before saving.',
    })
  })
})
