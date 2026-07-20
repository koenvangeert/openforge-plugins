import { describe, expect, it } from 'vitest'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { createMemoryPluginStorage } from '@openforge-app/plugin-sdk/testing'
import { DEFAULT_INTAKE_JQL, readIntakeQuery, saveIntakeQuery } from './intakeQuery'
import { PROJECT_KEY } from './protocol'

type Api = Pick<FrontendOpenForgeAPI, 'storage'>

describe('readIntakeQuery', () => {
  it('initializes the default JQL in the owning Project only', async () => {
    const storage = createMemoryPluginStorage()

    const result = await readIntakeQuery({ storage } satisfies Api, 'P-1')

    expect(result).toBe(DEFAULT_INTAKE_JQL)
    await expect(storage.project('P-1').get(PROJECT_KEY.intakeQuery)).resolves.toEqual({ jql: DEFAULT_INTAKE_JQL })
    await expect(storage.project('P-2').get(PROJECT_KEY.intakeQuery)).resolves.toBeNull()
    await expect(storage.global.get(PROJECT_KEY.intakeQuery)).resolves.toBeNull()
  })

  it('returns the persisted JQL for the Project', async () => {
    const storage = createMemoryPluginStorage()
    await storage.project('P-1').set(PROJECT_KEY.intakeQuery, { jql: 'project = KVG AND status = Triage' })

    await expect(readIntakeQuery({ storage } satisfies Api, 'P-1')).resolves.toBe('project = KVG AND status = Triage')
  })

  it('repairs a malformed stored value to the default JQL', async () => {
    const storage = createMemoryPluginStorage()
    await storage.project('P-1').set(PROJECT_KEY.intakeQuery, { jql: '   ' })

    await expect(readIntakeQuery({ storage } satisfies Api, 'P-1')).resolves.toBe(DEFAULT_INTAKE_JQL)
    await expect(storage.project('P-1').get(PROJECT_KEY.intakeQuery)).resolves.toEqual({ jql: DEFAULT_INTAKE_JQL })
  })
})

describe('saveIntakeQuery', () => {
  it('persists a trimmed JQL query for the Project', async () => {
    const storage = createMemoryPluginStorage()
    const api = { storage } satisfies Api

    await expect(saveIntakeQuery(api, 'P-1', '  project = KVG ORDER BY priority DESC  ')).resolves.toBe(
      'project = KVG ORDER BY priority DESC',
    )
    await expect(storage.project('P-1').get(PROJECT_KEY.intakeQuery)).resolves.toEqual({
      jql: 'project = KVG ORDER BY priority DESC',
    })
  })

  it('rejects a blank query so the workspace never loses its JQL', async () => {
    const storage = createMemoryPluginStorage()

    await expect(saveIntakeQuery({ storage } satisfies Api, 'P-1', '   ')).rejects.toThrow(/must not be empty/)
  })
})
