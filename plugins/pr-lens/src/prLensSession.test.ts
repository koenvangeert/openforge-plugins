import { agentSession } from './__fixtures__/agentSession'
import { describe, expect, it } from 'vitest'
import { createMockOpenForgeApi } from '@openforge-app/plugin-sdk/testing'
import { latestAgentSessionId } from './prLensSession'

describe('latestAgentSessionId', () => {
  it('is null for a task that never ran', async () => {
    const api = createMockOpenForgeApi({ pluginId: 'dev.kvg.pr-lens' })

    expect(await latestAgentSessionId(api.tasks, 'T-1')).toBeNull()
  })

  it('returns the newest session of that task', async () => {
    const api = createMockOpenForgeApi({
      pluginId: 'dev.kvg.pr-lens',
      agentSessions: [agentSession('S-1', 'T-1', 100), agentSession('S-2', 'T-1', 200)],
    })

    expect(await latestAgentSessionId(api.tasks, 'T-1')).toBe('S-2')
  })

  it('ignores sessions belonging to another task', async () => {
    const api = createMockOpenForgeApi({
      pluginId: 'dev.kvg.pr-lens',
      agentSessions: [agentSession('S-1', 'T-other', 100)],
    })

    expect(await latestAgentSessionId(api.tasks, 'T-1')).toBeNull()
  })
})
