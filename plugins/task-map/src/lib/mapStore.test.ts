import { describe, expect, it } from 'vitest'
import { createMemoryPluginStorage, createTestingCalls } from '@openforge-app/plugin-sdk/testing'
import { buildTaskDetail } from '../__fixtures__/tasks'
import type { CardPosition } from './cards'
import {
  forgetCardPositions,
  readCardPositions,
  readRegionLabels,
  resolveRegionLabels,
  writeCardPosition,
  writeRegionLabels,
} from './mapStore'

let projectCounter = 0

function newProjectId(): string {
  projectCounter += 1
  return `P-${projectCounter}`
}

function at(region: string | null, x: number, y: number): CardPosition {
  return { region, x, y }
}

describe('card positions', () => {
  it('reports no position for a Project that has never stored one', async () => {
    expect(await readCardPositions(createMemoryPluginStorage(), newProjectId())).toEqual({})
  })

  it('reads back a position it wrote', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()

    await writeCardPosition(storage, projectId, 'T-1', at('auth', 240, 116))

    expect(await readCardPositions(storage, projectId)).toEqual({ 'T-1': at('auth', 240, 116) })
  })

  it('replaces one Task position and leaves the others alone', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()
    await writeCardPosition(storage, projectId, 'T-1', at('auth', 0, 0))
    await writeCardPosition(storage, projectId, 'T-2', at('api', 10, 10))

    await writeCardPosition(storage, projectId, 'T-1', at('auth', 300, 40))

    expect(await readCardPositions(storage, projectId)).toEqual({
      'T-1': at('auth', 300, 40),
      'T-2': at('api', 10, 10),
    })
  })

  it('keeps every position of three overlapping writes', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()

    await Promise.all([
      writeCardPosition(storage, projectId, 'T-1', at('auth', 1, 1)),
      writeCardPosition(storage, projectId, 'T-2', at('auth', 2, 2)),
      writeCardPosition(storage, projectId, 'T-3', at('auth', 3, 3)),
    ])

    expect(await readCardPositions(storage, projectId)).toEqual({
      'T-1': at('auth', 1, 1),
      'T-2': at('auth', 2, 2),
      'T-3': at('auth', 3, 3),
    })
  })

  it('keeps a later write after an earlier one fails', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()
    const failing = {
      ...storage,
      project: (id: string) => ({
        ...storage.project(id),
        set: () => Promise.reject(new Error('the host went away')),
      }),
    }

    const rejected = writeCardPosition(failing, projectId, 'T-1', at('auth', 1, 1))
    const accepted = writeCardPosition(storage, projectId, 'T-2', at('auth', 2, 2))

    await expect(rejected).rejects.toThrow('the host went away')
    await accepted
    expect(await readCardPositions(storage, projectId)).toEqual({ 'T-2': at('auth', 2, 2) })
  })

  it('forgets only the Tasks it is asked to forget', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()
    await writeCardPosition(storage, projectId, 'T-1', at('auth', 1, 1))
    await writeCardPosition(storage, projectId, 'T-2', at('api', 2, 2))

    await forgetCardPositions(storage, projectId, ['T-1'])

    expect(await readCardPositions(storage, projectId)).toEqual({ 'T-2': at('api', 2, 2) })
  })

  it('reports a position written for one Project to that Project alone', async () => {
    const storage = createMemoryPluginStorage()
    const [mine, theirs] = [newProjectId(), newProjectId()]

    await writeCardPosition(storage, mine, 'T-1', at('auth', 240, 116))

    expect(await readCardPositions(storage, theirs)).toEqual({})
  })
})

describe('region labels', () => {
  it('tells a Project that has never curated an order from one that cleared it', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()

    expect(await readRegionLabels(storage, projectId)).toBeNull()

    await writeRegionLabels(storage, projectId, [])

    expect(await readRegionLabels(storage, projectId)).toEqual([])
  })

  it('reads back the order it wrote', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()

    await writeRegionLabels(storage, projectId, ['auth', 'api'])

    expect(await readRegionLabels(storage, projectId)).toEqual(['auth', 'api'])
  })

  it('reports an order written for one Project to that Project alone', async () => {
    const storage = createMemoryPluginStorage()
    const [mine, theirs] = [newProjectId(), newProjectId()]

    await writeRegionLabels(storage, mine, ['auth'])

    expect(await readRegionLabels(storage, theirs)).toBeNull()
  })
})

describe('resolveRegionLabels', () => {
  const labelled = [
    buildTaskDetail({ id: 'T-1', labels: ['auth'] }),
    buildTaskDetail({ id: 'T-2', labels: ['api'] }),
  ]

  it('seeds the order from the labels the active Tasks carry', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()

    expect(await resolveRegionLabels(storage, projectId, labelled)).toEqual(['api', 'auth'])
  })

  it('seeds once, then keeps the stored order as the Tasks change', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()
    await resolveRegionLabels(storage, projectId, labelled)

    const resolved = await resolveRegionLabels(storage, projectId, [
      ...labelled,
      buildTaskDetail({ id: 'T-3', labels: ['ops'] }),
    ])

    expect(resolved).toEqual(['api', 'auth'])
  })

  it('leaves a Project whose Tasks carry no label open to a later seed', async () => {
    const calls = createTestingCalls()
    const storage = createMemoryPluginStorage(calls)
    const projectId = newProjectId()

    expect(await resolveRegionLabels(storage, projectId, [buildTaskDetail({ id: 'T-1' })])).toEqual(
      [],
    )
    expect(calls.storageSets).toEqual([])
    expect(await resolveRegionLabels(storage, projectId, labelled)).toEqual(['api', 'auth'])
  })

  it('never re-seeds an order the user cleared', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()
    await writeRegionLabels(storage, projectId, [])

    expect(await resolveRegionLabels(storage, projectId, labelled)).toEqual([])
  })
})
