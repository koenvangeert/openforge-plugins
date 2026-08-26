import type { StartPromptContribution, TasksAPI } from '@openforge-app/plugin-sdk'

export const HANDOFF_NOTES_CONTRIBUTION_ID = 'handoff-notes-workflow'
export const MAX_START_PROMPT_CONTRIBUTION_LENGTH = 16_000

export const DEFAULT_HANDOFF_NOTES_TEMPLATE = `## Open Questions
Anything unresolved or that needs human judgement.

## What is built
Really, really short points describing what was built:
- No technical details
- Only end-user-facing changes
- What changed, not how

## Follow-up task
Cleanup or follow-up tasks created.`

const RESERVED_TEMPLATE_TAG_PATTERN = /<\/?(?:handoff_notes_template|openforge_task_management)\b/i
const TEMPLATE_CAPTURE_PATTERN = /<handoff_notes_template>\s*\n?([\s\S]*?)\n?\s*<\/handoff_notes_template>/i

type HandoffNotesTasksApi = Pick<
  TasksAPI,
  'listStartPromptContributions' | 'configureStartPromptContribution'
>

export interface HandoffNotesProjectSettings {
  template: string
  configured: boolean
  issue: string | null
}

export function buildHandoffNotesContribution(template: string): string {
  return `<openforge_task_management>
This task is {{taskId}}. Keep Handoff Notes in task-scoped Handoff Notes Workflow plugin storage. Use the plugin commands yourself and never ask the user to edit Handoff Notes. The removed task summary field is not a Handoff Notes store.

<handoff_notes_template>
${template.trim()}
</handoff_notes_template>

<handoff_notes_update cadence="handoff_or_completion">
A handoff is a point where you return control while implementation work remains unfinished. Opening a pull request and returning control while CI runs is a handoff. Group commands, file edits, test runs, commits, and internal work within the current handoff. Update Handoff Notes only when returning control at a handoff or after final completion.

For each update:
1. Read the current notes:
openforge plugin command invoke --command-id com.openforge.handoff-notes-workflow.get-handoff-notes

2. Draft the complete replacement from the active template above. Retain useful existing context and revise stale status. Keep the brief concise and user-facing. Each successful update replaces all previous Handoff Notes, so include the complete brief in every command input.

3. Replace the notes by passing valid JSON-escaped Markdown:
openforge plugin command invoke --command-id com.openforge.handoff-notes-workflow.update-handoff-notes --input '{"notes":"<complete Markdown Handoff Notes>"}'
</handoff_notes_update>

<handoff_notes_completion>
A handoff is ready to return when its update-handoff-notes command succeeds. The task is ready for final response when a final replacement succeeds after implementation is finished.
</handoff_notes_completion>
</openforge_task_management>`
}

export function validateHandoffNotesTemplate(template: string): string | null {
  if (!template.trim()) return null
  if (RESERVED_TEMPLATE_TAG_PATTERN.test(template)) {
    return 'The template cannot contain reserved Handoff Notes workflow tags.'
  }
  if (buildHandoffNotesContribution(template).length > MAX_START_PROMPT_CONTRIBUTION_LENGTH) {
    return 'The template is too long for the 16,000-character workflow prompt limit.'
  }
  return null
}

export function extractHandoffNotesTemplate(content: string): string | null {
  const template = TEMPLATE_CAPTURE_PATTERN.exec(content)?.[1]?.trim()
  return template && validateHandoffNotesTemplate(template) === null ? template : null
}

export async function ensureHandoffNotesContribution(
  tasks: HandoffNotesTasksApi,
  projectId: string,
): Promise<void> {
  const contributions = await tasks.listStartPromptContributions(projectId)
  const existing = contributions.find(({ id }) => id === HANDOFF_NOTES_CONTRIBUTION_ID)
  if (existing) {
    const template = extractHandoffNotesTemplate(existing.content) ?? DEFAULT_HANDOFF_NOTES_TEMPLATE
    const content = buildHandoffNotesContribution(template)
    if (existing.enabled && existing.content === content) return
    await tasks.configureStartPromptContribution({
      projectId,
      ...existing,
      enabled: true,
      content,
    })
    return
  }

  await saveHandoffNotesSettings(tasks, projectId, {
    template: DEFAULT_HANDOFF_NOTES_TEMPLATE,
  })
}

export async function loadHandoffNotesSettings(
  tasks: HandoffNotesTasksApi,
  projectId: string,
): Promise<HandoffNotesProjectSettings> {
  const contributions = await tasks.listStartPromptContributions(projectId)
  const contribution = contributions.find(({ id }) => id === HANDOFF_NOTES_CONTRIBUTION_ID)

  if (!contribution) {
    return {
      template: DEFAULT_HANDOFF_NOTES_TEMPLATE,
      configured: false,
      issue: null,
    }
  }

  const template = extractHandoffNotesTemplate(contribution.content)
  return {
    template: template ?? DEFAULT_HANDOFF_NOTES_TEMPLATE,
    configured: true,
    issue: template
      ? null
      : 'The saved workflow template is invalid. Reset it to the default before saving.',
  }
}

export async function saveHandoffNotesSettings(
  tasks: HandoffNotesTasksApi,
  projectId: string,
  settings: Pick<HandoffNotesProjectSettings, 'template'>,
): Promise<StartPromptContribution> {
  const validationIssue = validateHandoffNotesTemplate(settings.template)
  if (validationIssue) {
    throw new Error(validationIssue)
  }

  const contribution: StartPromptContribution = {
    id: HANDOFF_NOTES_CONTRIBUTION_ID,
    enabled: true,
    content: buildHandoffNotesContribution(settings.template.trim() || DEFAULT_HANDOFF_NOTES_TEMPLATE),
    order: 0,
  }
  const contributions = await tasks.configureStartPromptContribution({
    projectId,
    ...contribution,
  })

  return contributions.find(({ id }) => id === HANDOFF_NOTES_CONTRIBUTION_ID) ?? contribution
}

export function resetHandoffNotesSettings(
  tasks: HandoffNotesTasksApi,
  projectId: string,
): Promise<StartPromptContribution> {
  return saveHandoffNotesSettings(tasks, projectId, {
    template: DEFAULT_HANDOFF_NOTES_TEMPLATE,
  })
}
