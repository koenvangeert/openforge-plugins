import type { TaskOperationsAPI } from '@openforge-app/plugin-sdk'

type SessionReader = Pick<TaskOperationsAPI, 'listSessions'>

/**
 * `getLatestSession` is the natural call, but the SDK testing fake pins it to
 * null, so nothing built on it can be covered. `listSessions` is newest-first
 * over the same rows and answers the same question.
 */
export async function latestAgentSessionId(
  tasks: SessionReader,
  taskId: string,
): Promise<string | null> {
  const sessions = await tasks.listSessions({ taskId })
  return sessions[0]?.id ?? null
}
