import type { Disposable, PluginCommandInvocationContext } from '@openforge-app/plugin-sdk'
import type { BackendOpenForgeAPI } from '@openforge-app/plugin-sdk/backend'
import { formatIssues, safeParseGraphDoc } from '@coldtea/pr-lens-schema'
import { latestAgentSessionId } from './prLensSession'
import {
  DIAGRAM_UPDATED_EVENT,
  saveStoredDiagram,
  type StoredDiagram,
  type WorkingTreeCleanliness,
} from './prLensStorage'

export const PR_LENS_COMMAND_IDS = {
  saveDiagram: 'save-diagram',
} as const

export const SAVE_DIAGRAM_COMMAND_ID = `dev.kvg.pr-lens.${PR_LENS_COMMAND_IDS.saveDiagram}`

interface SaveDiagramInput {
  document: unknown
  cleanliness?: WorkingTreeCleanliness
}

const SAVE_INPUT_SCHEMA = {
  type: 'object',
  required: ['document'],
  additionalProperties: false,
  properties: {
    document: { type: 'object' },
    cleanliness: { type: 'string', enum: ['clean', 'dirty'] },
  },
}

const SAVE_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['status', 'taskId', 'storedAt', 'title', 'lenses'],
  properties: {
    status: { type: 'string', enum: ['stored'] },
    taskId: { type: 'string' },
    storedAt: { type: 'string' },
    title: { type: 'string' },
    lenses: { type: 'array', items: { type: 'string' } },
  },
}

export function registerPrLensCommands(api: BackendOpenForgeAPI): Disposable[] {
  return [
    api.commands.register({
      id: PR_LENS_COMMAND_IDS.saveDiagram,
      title: 'Save PR Lens Diagram',
      discoverable: false,
      agent: {
        description:
          'Store the PR Lens graph document describing this OpenForge Task\'s change, so the Task shows it as a diagram.',
        examples: [{ cleanliness: 'clean' }],
      },
      input: SAVE_INPUT_SCHEMA,
      output: SAVE_OUTPUT_SCHEMA,
      handler: async (input: SaveDiagramInput, invocation) => saveDiagram(api, input, invocation),
    }),
  ]
}

export async function saveDiagram(
  api: BackendOpenForgeAPI,
  input: SaveDiagramInput,
  invocation: PluginCommandInvocationContext,
) {
  const taskId = resolveTaskId(api, invocation)

  const parsed = safeParseGraphDoc(input?.document)
  if (!parsed.ok) {
    throw new Error(
      `The PR Lens graph document is not valid. Correct these and call the command again:\n${formatIssues(parsed.error.issues)}`,
    )
  }

  const diagram: StoredDiagram = {
    document: parsed.value,
    sessionId: await latestAgentSessionId(api.tasks, taskId),
    storedAt: new Date().toISOString(),
    cleanliness: input.cleanliness ?? null,
  }
  await saveStoredDiagram(api.storage, taskId, diagram)
  await api.events.emit(DIAGRAM_UPDATED_EVENT, { taskId })

  return {
    status: 'stored',
    taskId,
    storedAt: diagram.storedAt,
    title: parsed.value.title,
    lenses: parsed.value.lenses,
  }
}

function resolveTaskId(
  api: BackendOpenForgeAPI,
  invocation: PluginCommandInvocationContext,
): string {
  const taskId = invocation?.taskId ?? api.context.getSnapshot().taskId ?? null
  if (!taskId) {
    throw new Error('Saving a PR Lens diagram requires OpenForge Task context.')
  }
  return taskId
}
