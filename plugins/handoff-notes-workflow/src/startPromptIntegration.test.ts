import type { StartPromptContribution, Task } from '@openforge-app/plugin-sdk'
import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HANDOFF_NOTES_TEMPLATE,
  ensureHandoffNotesContribution,
  loadHandoffNotesSettings,
  saveHandoffNotesSettings,
} from './handoffNotesSettings'

function existingTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'KVG-existing',
    initial_prompt: 'Implement the existing task.',
    prompt: null,
    status: 'backlog',
    project_id: 'P-8',
    ...overrides,
  } as Task
}

function generateStartPrompt(task: Task, contributions: StartPromptContribution[]): string {
  const prefix = contributions
    .filter(({ enabled, content }) => enabled && content.trim())
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id))
    .map(({ id, content }) => {
      const rendered = content
        .replaceAll('{{taskId}}', task.id)
        .replaceAll('{{task_id}}', task.id)
      return `<openforge_start_prompt_contribution id="${id}">\n${rendered}\n</openforge_start_prompt_contribution>`
    })
    .join('\n\n')

  return prefix ? `${prefix}\n\n${task.initial_prompt}` : task.initial_prompt
}

async function startPromptFor(task: Task, template: string): Promise<string> {
  const registry = createOpenForgeRegistryFake({ projectId: 'P-8', taskId: task.id })
  await saveHandoffNotesSettings(registry.frontendApi.tasks, 'P-8', { template })
  await registry.frontendApi.tasks.startImplementation({ taskId: task.id })
  const contributions = await registry.frontendApi.tasks.listStartPromptContributions('P-8')
  return generateStartPrompt(task, contributions)
}

describe('Handoff Notes start-prompt integration', () => {
  it('requires concise replacements at meaningful handoffs and final completion', async () => {
    const task = existingTask({
      id: 'KVG-1809',
      initial_prompt: 'Wire the workflow into start prompts.',
    })

    const prompt = await startPromptFor(
      task,
      '## Team handoff\nInclude rollout status.',
    )

    expect(prompt).toContain('<openforge_start_prompt_contribution id="handoff-notes-workflow">')
    expect(prompt).toContain('## Team handoff\nInclude rollout status.')
    expect(prompt).toContain('cadence="handoff_or_completion"')
    expect(prompt).toContain('A handoff is a point where you return control while implementation work remains unfinished.')
    expect(prompt).toContain('Opening a pull request and returning control while CI runs is a handoff.')
    expect(prompt).toContain('Group commands, file edits, test runs, commits, and internal work within the current handoff.')
    expect(prompt).toContain('Update Handoff Notes only when returning control at a handoff or after final completion.')
    expect(prompt).toContain('The task is ready for final response when a final replacement succeeds')
    expect(prompt).toContain('Each successful update replaces all previous Handoff Notes')
    expect(prompt).toContain('com.openforge.handoff-notes-workflow.get-handoff-notes')
    expect(prompt).toContain('com.openforge.handoff-notes-workflow.update-handoff-notes')
    expect(prompt.match(/update-handoff-notes --input/g)).toHaveLength(1)
    expect(prompt).toContain('from the active template above.')
    expect(prompt).toContain('Retain useful existing context')
    expect(prompt).toContain('valid JSON-escaped Markdown')
    expect(prompt).toContain('never ask the user to edit Handoff Notes')
    expect(prompt).not.toContain('after_completion_before_final_response')
    expect(prompt).not.toContain('after_initial_analysis')
    expect(prompt).not.toContain('openforge task update')
    expect(prompt).toContain('Wire the workflow into start prompts.')
  })

  it('injects the enabled default workflow for an unconfigured project', async () => {
    const task = existingTask()
    const registry = createOpenForgeRegistryFake({ projectId: 'P-8', taskId: task.id })

    await ensureHandoffNotesContribution(registry.frontendApi.tasks, 'P-8')
    await registry.frontendApi.tasks.startImplementation({ taskId: task.id })
    const settings = await loadHandoffNotesSettings(registry.frontendApi.tasks, 'P-8')
    const contributions = await registry.frontendApi.tasks.listStartPromptContributions('P-8')
    const prompt = generateStartPrompt(task, contributions)

    expect(settings).toMatchObject({
      configured: true,
      template: DEFAULT_HANDOFF_NOTES_TEMPLATE,
    })
    expect(prompt).toContain('<openforge_start_prompt_contribution id="handoff-notes-workflow">')
    expect(prompt).toContain('## Open Questions')
    expect(prompt).toContain('update-handoff-notes')
    expect(prompt).toContain(task.initial_prompt)
  })
})
