import { describe, expect, it } from 'vitest'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { createMemoryPluginStorage } from '@openforge-app/plugin-sdk/testing'
import {
  DEFAULT_INTAKE_FILTER,
  activateIntakeFilter,
  deleteIntakeFilter,
  readIntakeFilters,
  saveIntakeFilter,
} from './intakeFilters'
import { PROJECT_KEY } from './protocol'

type Api = Pick<FrontendOpenForgeAPI, 'storage'>

describe('readIntakeFilters', () => {
  it('initializes one active default filter in the owning Project only', async () => {
    const storage = createMemoryPluginStorage()

    const result = await readIntakeFilters({ storage } satisfies Api, 'P-1')

    expect(result).toEqual({ filters: [DEFAULT_INTAKE_FILTER], activeFilterId: DEFAULT_INTAKE_FILTER.id })
    await expect(storage.project('P-1').get(PROJECT_KEY.intakeFilters)).resolves.toEqual(result)
    await expect(storage.project('P-2').get(PROJECT_KEY.intakeFilters)).resolves.toBeNull()
    await expect(storage.global.get(PROJECT_KEY.intakeFilters)).resolves.toBeNull()
  })

  it('saves named filters without changing the active filter', async () => {
    const storage = createMemoryPluginStorage()
    const api = { storage } satisfies Api

    const result = await saveIntakeFilter(api, 'P-1', {
      id: 'triage',
      name: 'Triage queue',
      jql: 'project = KVG AND status = Triage',
    })

    expect(result).toEqual({
      filters: [
        DEFAULT_INTAKE_FILTER,
        { id: 'triage', name: 'Triage queue', jql: 'project = KVG AND status = Triage' },
      ],
      activeFilterId: DEFAULT_INTAKE_FILTER.id,
    })
  })

  it('keeps exactly one active filter when filters are activated and deleted', async () => {
    const storage = createMemoryPluginStorage()
    const api = { storage } satisfies Api
    await saveIntakeFilter(api, 'P-1', { id: 'triage', name: 'Triage', jql: 'status = Triage' })

    await expect(activateIntakeFilter(api, 'P-1', 'triage')).resolves.toMatchObject({
      activeFilterId: 'triage',
    })
    await expect(deleteIntakeFilter(api, 'P-1', 'triage')).resolves.toEqual({
      filters: [DEFAULT_INTAKE_FILTER],
      activeFilterId: DEFAULT_INTAKE_FILTER.id,
    })
    await expect(deleteIntakeFilter(api, 'P-1', DEFAULT_INTAKE_FILTER.id)).resolves.toEqual({
      filters: [DEFAULT_INTAKE_FILTER],
      activeFilterId: DEFAULT_INTAKE_FILTER.id,
    })
  })

  it('repairs an empty stored filter set to the default invariant', async () => {
    const storage = createMemoryPluginStorage()
    await storage.project('P-1').set(PROJECT_KEY.intakeFilters, { filters: [], activeFilterId: '' })

    await expect(readIntakeFilters({ storage } satisfies Api, 'P-1')).resolves.toEqual({
      filters: [DEFAULT_INTAKE_FILTER],
      activeFilterId: DEFAULT_INTAKE_FILTER.id,
    })
  })
})
