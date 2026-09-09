import type { PluginStorage, TaskFollowUpDisposition, TasksAPI } from '@openforge-app/plugin-sdk'
import { TaskFollowUpError } from '@openforge-app/plugin-sdk'
import { DEFAULT_PROMPT_TEMPLATE, loadPromptTemplate } from './prLensTemplate'

export type DiagramRequestOutcome =
  | { status: TaskFollowUpDisposition }
  | { status: 'failed'; reason: string; message: string }

const FAILURE_REASONS: Record<string, string> = {
  NO_SESSION: 'this task has no Agent Session that can take a prompt',
  DELIVERY_FAILED: 'the Agent Session did not accept the prompt',
}

export async function requestDiagram(
  deps: { tasks: Pick<TasksAPI, 'sendFollowUp'>; storage: PluginStorage },
  target: { taskId: string; projectId: string | null },
): Promise<DiagramRequestOutcome> {
  const message = target.projectId
    ? await loadPromptTemplate(deps.storage, target.projectId)
    : DEFAULT_PROMPT_TEMPLATE

  try {
    const receipt = await deps.tasks.sendFollowUp({ taskId: target.taskId, message })
    return { status: receipt.disposition }
  } catch (error: unknown) {
    if (error instanceof TaskFollowUpError) {
      return {
        status: 'failed',
        reason: error.code,
        message: FAILURE_REASONS[error.code] ?? error.message,
      }
    }
    return {
      status: 'failed',
      reason: 'UNKNOWN',
      message: error instanceof Error ? error.message : 'the request could not be sent',
    }
  }
}
