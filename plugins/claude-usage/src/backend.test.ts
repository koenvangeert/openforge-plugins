import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpenForgeRegistryFake, type TestingOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import packageJson from '../package.json'
import backend from './backend'
import type { SpendDashboardData, TaskSpendData } from './dashboard'
import { DEFAULT_RESCAN_MINUTES } from './rescanInterval'
import { PACKAGE_METADATA } from './testMetadata'

let registry: TestingOpenForgeRegistryFake | null = null

async function activate(): Promise<TestingOpenForgeRegistryFake> {
  registry = createOpenForgeRegistryFake({
    pluginId: packageJson.openforge.id,
    projectId: null,
    packageMetadata: PACKAGE_METADATA,
  })
  await registry.activateBackend(backend)
  return registry
}

afterEach(async () => {
  await registry?.disposeAll()
  registry = null
})

describe('claude-usage backend activation', () => {
  it('indexes globally, because spend spans every project', async () => {
    const fake = await activate()

    expect(fake.snapshot.backgroundServices).toMatchObject([{ id: 'spend-index', scope: 'global', started: true }])
  })

  it('exposes the dashboard and a manual rescan to the renderer', async () => {
    const fake = await activate()

    expect(fake.snapshot.backendMethods.map((method) => method.id).sort()).toEqual([
      'getDashboard',
      'getTaskSpend',
      'refresh',
    ])
  })

  it('answers getDashboard with zeroed totals when no transcripts are present', async () => {
    const fake = await activate()

    const dashboard = await invokeDashboard(fake)

    expect(dashboard.totals.allTime.total).toBe(0)
    expect(dashboard.dailySeries).toHaveLength(30)
  })

  it('answers getTaskSpend for a task with no indexed transcripts', async () => {
    const fake = await activate()
    const method = fake.snapshot.backendMethods.find((entry) => entry.id === 'getTaskSpend')!

    const taskSpend = (await method.registration.handler({ taskId: 'T-1' })) as TaskSpendData

    expect(taskSpend).toMatchObject({ taskId: 'T-1', found: false, total: 0 })
  })

  it('leaves no pending rescan behind when the service stops', async () => {
    const setTimeout = vi.spyOn(globalThis, 'setTimeout')
    const clearTimeout = vi.spyOn(globalThis, 'clearTimeout')
    const fake = await activate()
    await vi.waitFor(() => expect(setTimeout).toHaveBeenCalled())

    await fake.disposeAll()
    registry = null

    expect(clearTimeout).toHaveBeenCalled()
    setTimeout.mockRestore()
    clearTimeout.mockRestore()
  })

  it('rearms from the stored interval, so a changed setting needs no restart', async () => {
    const setTimeout = vi.spyOn(globalThis, 'setTimeout')
    await activate()

    await vi.waitFor(() => expect(setTimeout).toHaveBeenCalled())

    const delays = setTimeout.mock.calls.map((call) => call[1])
    expect(delays).toContain(DEFAULT_RESCAN_MINUTES * 60 * 1000)
    setTimeout.mockRestore()
  })
})

async function invokeDashboard(fake: TestingOpenForgeRegistryFake): Promise<SpendDashboardData> {
  const method = fake.snapshot.backendMethods.find((entry) => entry.id === 'getDashboard')!
  return (await method.registration.handler(null)) as SpendDashboardData
}
