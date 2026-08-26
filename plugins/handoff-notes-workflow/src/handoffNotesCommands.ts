import type { Disposable, PluginCommandInvocationContext } from '@openforge-app/plugin-sdk'
import type { BackendOpenForgeAPI } from '@openforge-app/plugin-sdk/backend'
import { validateHandoffNotes } from './handoffNotes'
import { loadHandoffNotesSettings } from './handoffNotesSettings'
import {
  HANDOFF_NOTES_UPDATED_EVENT,
  loadStoredHandoffNotes,
  saveStoredHandoffNotes,
} from './handoffNotesStorage'

export const HANDOFF_NOTES_COMMAND_IDS = {
  get: 'get-handoff-notes',
  update: 'update-handoff-notes',
} as const

interface UpdateHandoffNotesInput {
  notes: string
}

const GET_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['status', 'taskId', 'notes'],
  properties: {
    status: { type: 'string', enum: ['empty', 'ready'] },
    taskId: { type: 'string' },
    notes: { type: 'string' },
  },
}

const UPDATE_INPUT_SCHEMA = {
  type: 'object',
  required: ['notes'],
  additionalProperties: false,
  properties: {
    notes: { type: 'string', minLength: 1 },
  },
}

const UPDATE_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['status', 'taskId', 'notes', 'validationStatus', 'validationMessage'],
  properties: {
    status: { type: 'string', enum: ['updated'] },
    taskId: { type: 'string' },
    notes: { type: 'string' },
    validationStatus: { type: 'string', enum: ['empty', 'incomplete', 'complete'] },
    validationMessage: { type: 'string' },
  },
}

export function registerHandoffNotesCommands(api: BackendOpenForgeAPI): Disposable[] {
  return [
    api.commands.register({
      id: HANDOFF_NOTES_COMMAND_IDS.get,
      title: 'Get Handoff Notes',
      discoverable: false,
      agent: {
        description: 'Read the agent-maintained Handoff Notes for the current OpenForge Task before replacing them.',
      },
      output: GET_OUTPUT_SCHEMA,
      handler: async (_input, invocation) => getHandoffNotes(api, invocation),
    }),
    api.commands.register({
      id: HANDOFF_NOTES_COMMAND_IDS.update,
      title: 'Update Handoff Notes',
      discoverable: false,
      agent: {
        description: 'Replace the current OpenForge Task Handoff Notes with a complete Markdown reviewer brief at meaningful handoffs and final completion.',
        examples: [{
          notes: '## Open Questions\nNone.\n\n## What is built\n- Users can review agent-maintained handoff notes.\n\n## Follow-up task\nNone.',
        }],
      },
      input: UPDATE_INPUT_SCHEMA,
      output: UPDATE_OUTPUT_SCHEMA,
      handler: async (input: UpdateHandoffNotesInput, invocation) => updateHandoffNotes(api, input, invocation),
    }),
  ]
}

export async function getHandoffNotes(
  api: BackendOpenForgeAPI,
  invocation: PluginCommandInvocationContext,
) {
  const taskId = resolveTaskId(api, invocation)
  const notes = await loadStoredHandoffNotes(api.storage, taskId)
  return {
    status: notes ? 'ready' : 'empty',
    taskId,
    notes,
  }
}

export async function updateHandoffNotes(
  api: BackendOpenForgeAPI,
  input: UpdateHandoffNotesInput,
  invocation: PluginCommandInvocationContext,
) {
  if (typeof input?.notes !== 'string' || !input.notes.trim()) {
    throw new Error('Handoff Notes must be non-empty Markdown.')
  }

  const taskId = resolveTaskId(api, invocation)
  const projectId = await resolveProjectId(api, taskId, invocation)
  const settings = await loadHandoffNotesSettings(api.tasks, projectId)
  const notes = await saveStoredHandoffNotes(api.storage, taskId, input.notes)
  const validation = validateHandoffNotes(notes, settings.template)
  await api.events.emit(HANDOFF_NOTES_UPDATED_EVENT, { taskId })

  return {
    status: 'updated',
    taskId,
    notes,
    validationStatus: validation.status,
    validationMessage: validation.message,
  }
}

function resolveTaskId(
  api: BackendOpenForgeAPI,
  invocation: PluginCommandInvocationContext,
): string {
  const taskId = invocation?.taskId ?? api.context.getSnapshot().taskId ?? null
  if (!taskId) {
    throw new Error('Handoff Notes commands require OpenForge Task context.')
  }
  return taskId
}

async function resolveProjectId(
  api: BackendOpenForgeAPI,
  taskId: string,
  invocation: PluginCommandInvocationContext,
): Promise<string> {
  const projectId = invocation?.projectId ?? api.context.getSnapshot().projectId ?? null
  if (projectId) return projectId

  const task = await api.tasks.get(taskId)
  if (task?.project_id) return task.project_id

  throw new Error('Handoff Notes commands require OpenForge Project context.')
}
