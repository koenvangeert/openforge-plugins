import { describe, expect, it } from 'vitest'
import { createMemoryPluginStorage } from '@openforge-app/plugin-sdk/testing'
import { buildTaskDetail } from '../__fixtures__/tasks'
import type { CardPosition } from './cards'
import { bandTitle, MIN_BAND_HEIGHT, OTHER_BAND_TITLE, type Band } from './bands'
import {
  readBands,
  readCardPositions,
  resolveBands,
  writeBands,
  writeCardPosition,
} from './mapStore'

let projectCounter = 0

function newProjectId(): string {
  projectCounter += 1
  return `P-${projectCounter}`
}

function at(band: string | null, taskId: string, x: number, y: number): CardPosition {
  return { band, taskId, x, y }
}

function box(label: string | null, x = 0, y = 0): Band {
  return { label, x, y, width: 400, height: MIN_BAND_HEIGHT }
}

describe('card positions', () => {
  it('reports no position for a Project that has never stored one', async () => {
    expect(await readCardPositions(createMemoryPluginStorage(), newProjectId())).toEqual([])
  })

  it('reads back a position it wrote', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()

    await writeCardPosition(storage, projectId, at('auth', 'T-1', 240, 116))

    expect(await readCardPositions(storage, projectId)).toEqual([at('auth', 'T-1', 240, 116)])
  })

  it('replaces one card position and leaves the others alone', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()
    await writeCardPosition(storage, projectId, at('auth', 'T-1', 0, 0))
    await writeCardPosition(storage, projectId, at('api', 'T-2', 10, 10))

    await writeCardPosition(storage, projectId, at('auth', 'T-1', 300, 40))

    expect(await readCardPositions(storage, projectId)).toEqual([
      at('api', 'T-2', 10, 10),
      at('auth', 'T-1', 300, 40),
    ])
  })

  it('holds a position per Band, so one copy of a Task does not overwrite the other', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()

    await writeCardPosition(storage, projectId, at('auth', 'T-1', 1, 1))
    await writeCardPosition(storage, projectId, at('api', 'T-1', 2, 2))

    expect(await readCardPositions(storage, projectId)).toEqual([
      at('auth', 'T-1', 1, 1),
      at('api', 'T-1', 2, 2),
    ])
  })

  it('keeps every position of three overlapping writes', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()

    await Promise.all([
      writeCardPosition(storage, projectId, at('auth', 'T-1', 1, 1)),
      writeCardPosition(storage, projectId, at('auth', 'T-2', 2, 2)),
      writeCardPosition(storage, projectId, at('auth', 'T-3', 3, 3)),
    ])

    expect(await readCardPositions(storage, projectId)).toEqual([
      at('auth', 'T-1', 1, 1),
      at('auth', 'T-2', 2, 2),
      at('auth', 'T-3', 3, 3),
    ])
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

    const rejected = writeCardPosition(failing, projectId, at('auth', 'T-1', 1, 1))
    const accepted = writeCardPosition(storage, projectId, at('auth', 'T-2', 2, 2))

    await expect(rejected).rejects.toThrow('the host went away')
    await accepted
    expect(await readCardPositions(storage, projectId)).toEqual([at('auth', 'T-2', 2, 2)])
  })

  it('drops an unreadable stored entry rather than the whole map', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()
    await storage
      .project(projectId)
      .set('cardPositions', [{ nonsense: true }, at('auth', 'T-1', 5, 5)])

    expect(await readCardPositions(storage, projectId)).toEqual([at('auth', 'T-1', 5, 5)])
  })

  it('reads no position from a stored value that is not a list', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()
    await storage.project(projectId).set('cardPositions', { 'T-1': { x: 1, y: 1 } })

    expect(await readCardPositions(storage, projectId)).toEqual([])
  })

  it('reports a position written for one Project to that Project alone', async () => {
    const storage = createMemoryPluginStorage()
    const [mine, theirs] = [newProjectId(), newProjectId()]

    await writeCardPosition(storage, mine, at('auth', 'T-1', 240, 116))

    expect(await readCardPositions(storage, theirs)).toEqual([])
  })
})

describe('bands', () => {
  it('tells a Project that has never stored a Band from one that has', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()

    expect(await readBands(storage, projectId)).toBeNull()

    await writeBands(storage, projectId, [box('auth')])

    expect(await readBands(storage, projectId)).toEqual([box('auth')])
  })

  it('reads back the placement it wrote', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()

    await writeBands(storage, projectId, [box('auth', 100, 200), box(null, 0, 900)])

    expect(await readBands(storage, projectId)).toEqual([box('auth', 100, 200), box(null, 0, 900)])
  })

  it('drops an unreadable stored Band rather than the whole map', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()
    await storage.project(projectId).set('bands', [{ label: 'auth' }, box('api')])

    expect(await readBands(storage, projectId)).toEqual([box('api')])
  })

  it('reports a placement written for one Project to that Project alone', async () => {
    const storage = createMemoryPluginStorage()
    const [mine, theirs] = [newProjectId(), newProjectId()]

    await writeBands(storage, mine, [box('auth')])

    expect(await readBands(storage, theirs)).toBeNull()
  })
})

describe('resolveBands', () => {
  const labelled = [
    buildTaskDetail({ id: 'T-1', labels: ['auth'] }),
    buildTaskDetail({ id: 'T-2', labels: ['api'] }),
  ]

  it('seeds a Band per label the active Tasks carry, plus the Other Band', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()

    const bands = await resolveBands(storage, projectId, labelled)

    expect(bands.map(bandTitle)).toEqual(['api', 'auth', OTHER_BAND_TITLE])
  })

  it('seeds once, then keeps the stored Bands as the Tasks change', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()
    await resolveBands(storage, projectId, labelled)

    const resolved = await resolveBands(storage, projectId, [
      ...labelled,
      buildTaskDetail({ id: 'T-3', labels: ['ops'] }),
    ])

    expect(resolved.map(bandTitle)).toEqual(['api', 'auth', OTHER_BAND_TITLE])
  })

  it('seeds only the Other Band for a Project whose Tasks carry no label', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()

    const bands = await resolveBands(storage, projectId, [buildTaskDetail({ id: 'T-1' })])

    expect(bands.map(bandTitle)).toEqual([OTHER_BAND_TITLE])
  })

  it('never re-seeds a set the user cut back to the Other Band', async () => {
    const storage = createMemoryPluginStorage()
    const projectId = newProjectId()
    await writeBands(storage, projectId, [box(null)])

    expect(await resolveBands(storage, projectId, labelled)).toEqual([box(null)])
  })
})
