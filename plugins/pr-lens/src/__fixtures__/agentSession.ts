import type { AgentSession } from '@openforge-app/plugin-sdk'

export function agentSession(id: string, taskId: string, createdAt: number): AgentSession {
  return {
    id,
    ticket_id: taskId,
    opencode_session_id: null,
    stage: 'implement',
    status: 'completed',
    checkpoint_data: null,
    pty_instance_id: null,
    error_message: null,
    created_at: createdAt,
    updated_at: createdAt,
    provider: 'claude',
    claude_session_id: null,
    pi_session_id: null,
    grok_session_id: null,
    output_revision: 0,
    viewed_output_revision: 0,
  }
}
