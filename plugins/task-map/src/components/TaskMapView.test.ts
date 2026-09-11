// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import { tick } from 'svelte'
import type { ActiveTasks, Task, TaskDetail } from '@openforge-app/plugin-sdk/domain'
import type { JsonValue, TaskChangeEvent } from '@openforge-app/plugin-sdk'
import type { FrontendOpenForgeAPI, OpenForgeContextSnapshot } from '@openforge-app/plugin-sdk/frontend'
import { createMockFrontendOpenForgeApi } from '@openforge-app/plugin-sdk/testing'
import { createHostStorage } from '../__fixtures__/storage'
import TaskMapView from './TaskMapView.svelte'
import {
  buildLabelAssignment,
  buildSeededTask,
  buildTaskDetail,
  FIXTURE_PROJECT_ID,
  type LabelAssignment,
} from '../__fixtures__/tasks'
import { pointerEvent } from '../__fixtures__/pointer'
import { CANVAS_PADDING } from '../lib/cards'
import { OTHER_REGION_TITLE, REGION_HEADING_HEIGHT } from '../lib/regions'

const PLUGIN_ID = 'dev.kvg.task-map'

function viewContext(projectId: string | null): OpenForgeContextSnapshot {
  return { pluginId: PLUGIN_ID, projectId }
}

function cardIds(): (string | undefined)[] {
  return screen.getAllByRole('button').flatMap((control) => control.dataset.taskId ?? [])
}

function arrowKeys(): (string | undefined)[] {
  return screen
    .getAllByTestId('task-map-arrow')
    .flatMap((arrow) => arrow.dataset.arrow ?? [])
    .sort()
}

function bandTitles(): string[] {
  return screen.getAllByRole('heading', { level: 2 }).map((band) => band.textContent?.trim() ?? '')
}

function cardOf(taskId: string): HTMLElement {
  const card = screen
    .getByTestId('task-map-layer')
    .querySelector<HTMLElement>(`[data-task-id="${taskId}"]`)
  if (!card) throw new Error(`no card for Task ${taskId}`)
  return card
}

function flushWrites(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function bandOfCard(taskId: string): string {
  const card = cardOf(taskId)

  const cardTop = Number.parseFloat(card.style.top)
  const band = screen.getAllByTestId('task-map-region').find((element) => {
    const bandTop = Number.parseFloat(element.style.top)
    return cardTop >= bandTop && cardTop < bandTop + Number.parseFloat(element.style.height)
  })
  if (!band) throw new Error(`the card for Task ${taskId} sits in no band`)

  return band.querySelector('h2')?.textContent?.trim() ?? ''
}

function renderView(
  tasks: Task[],
  projectId: string | null = FIXTURE_PROJECT_ID,
  taskLabelAssignments: LabelAssignment[] = [],
) {
  const api = createMockFrontendOpenForgeApi({
    pluginId: PLUGIN_ID,
    projectId: FIXTURE_PROJECT_ID,
    tasks,
    taskLabelAssignments,
  })
  render(TaskMapView, { props: { api, context: viewContext(projectId) } })
  return api
}

describe('TaskMapView card set', () => {
  it('draws one card per non-Completed Task', async () => {
    renderView([
      buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
      buildSeededTask({ id: 'T-2', title: 'Split the reader', status: 'doing' }),
      buildSeededTask({ id: 'T-3', title: 'Archive the runs', status: 'done' }),
    ])

    expect(await screen.findByRole('button', { name: /Rotate the tokens/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Split the reader/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Archive the runs/ })).toBeNull()
  })

  it('reads only the active Project', async () => {
    const api = renderView([
      buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
      buildSeededTask({ id: 'T-9', title: 'Someone else', projectId: 'P-2' }),
    ])

    await screen.findByRole('button', { name: /Rotate the tokens/ })

    expect(api.__testing.calls.taskActiveRequests).toEqual([{ projectId: FIXTURE_PROJECT_ID }])
    expect(screen.queryByRole('button', { name: /Someone else/ })).toBeNull()
  })
})

describe('TaskMapView empty states', () => {
  it('says no Project is selected and draws no cards', () => {
    const api = renderView([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })], null)

    expect(screen.getByText('No Project selected')).toBeTruthy()
    expect(screen.queryByTestId('task-map-surface')).toBeNull()
    expect(api.__testing.calls.taskActiveRequests).toEqual([])
  })

  it('says the Project has no active Tasks and draws no cards', async () => {
    renderView([buildSeededTask({ id: 'T-1', title: 'Archive the runs', status: 'done' })])

    expect(await screen.findByText('No active Tasks')).toBeTruthy()
    expect(screen.queryByTestId('task-map-surface')).toBeNull()
  })
})

describe('TaskMapView navigation', () => {
  it('opens a clicked Task on the host board', async () => {
    const api = renderView([buildSeededTask({ id: 'T-42', title: 'Rotate the tokens' })])

    await fireEvent.click(await screen.findByRole('button', { name: /Rotate the tokens/ }))

    expect(api.__testing.calls.navigationRequests).toEqual([{ viewId: 'board', taskId: 'T-42' }])
  })
})

describe('TaskMapView zoom controls', () => {
  it('changes the rendered zoom and resets it', async () => {
    renderView([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])
    await screen.findByRole('button', { name: /Rotate the tokens/ })
    const layer = screen.getByTestId('task-map-layer')

    await fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByText('125%')).toBeTruthy()
    expect(layer.style.transform).toContain('scale(1.25)')

    await fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
    expect(screen.getByText('100%')).toBeTruthy()
    expect(layer.style.transform).toBe('translate(0px, 0px) scale(1)')
  })

  it('disables reset until the view moves', async () => {
    renderView([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])
    await screen.findByRole('button', { name: /Rotate the tokens/ })

    const reset = screen.getByRole('button', { name: 'Reset view' })
    expect(reset).toHaveProperty('disabled', true)

    await fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))

    expect(reset).toHaveProperty('disabled', false)
  })
})

describe('TaskMapView Project switching', () => {
  it('replaces the map with the new Project\'s own cards', async () => {
    const api = createMockFrontendOpenForgeApi({
      pluginId: PLUGIN_ID,
      projectId: FIXTURE_PROJECT_ID,
      tasks: [
        buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
        buildSeededTask({ id: 'T-2', title: 'Split the reader', projectId: 'P-2' }),
      ],
    })
    const { rerender } = render(TaskMapView, {
      props: { api, context: viewContext(FIXTURE_PROJECT_ID) },
    })
    await screen.findByRole('button', { name: /Rotate the tokens/ })

    await rerender({ api, context: viewContext('P-2') })

    expect(await screen.findByRole('button', { name: /Split the reader/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Rotate the tokens/ })).toBeNull()
  })

  it('discards a read that lands after the Project changed', async () => {
    const pending = new Map<string, (tasks: ActiveTasks) => void>()
    const base = createMockFrontendOpenForgeApi({
      pluginId: PLUGIN_ID,
      projectId: FIXTURE_PROJECT_ID,
    })
    const api: FrontendOpenForgeAPI = {
      ...base,
      tasks: {
        ...base.tasks,
        active: (projectId) =>
          new Promise<ActiveTasks>((resolve) => {
            pending.set(projectId, resolve)
          }),
      },
    }

    const { rerender } = render(TaskMapView, {
      props: { api, context: viewContext(FIXTURE_PROJECT_ID) },
    })
    await rerender({ api, context: viewContext('P-2') })

    pending.get('P-2')?.({
      tasks: [buildTaskDetail({ id: 'T-2', title: 'Split the reader', projectId: 'P-2' })],
      related: [],
    })
    pending.get(FIXTURE_PROJECT_ID)?.({
      tasks: [buildTaskDetail({ id: 'T-1', title: 'Rotate the tokens' })],
      related: [],
    })

    expect(await screen.findByRole('button', { name: /Split the reader/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Rotate the tokens/ })).toBeNull()
  })
})

describe('TaskMapView dependency arrows', () => {
  it('draws an arrow from the blocker to the waiter', async () => {
    renderView([
      buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
      buildSeededTask({ id: 'T-2', title: 'Split the reader', dependsOn: ['T-1'] }),
    ])
    await screen.findByRole('button', { name: /Rotate the tokens/ })

    expect(arrowKeys()).toEqual(['T-1->T-2'])
  })

  it('draws no arrow for a dependency on a Completed Task, and keeps the waiting card', async () => {
    renderView([
      buildSeededTask({ id: 'T-1', title: 'Archive the runs', status: 'done' }),
      buildSeededTask({ id: 'T-2', title: 'Split the reader', dependsOn: ['T-1'] }),
    ])

    expect(await screen.findByRole('button', { name: /Split the reader/ })).toBeTruthy()
    expect(screen.queryAllByTestId('task-map-arrow')).toHaveLength(0)
  })

  it('draws no arrow for a dependency on a Task that no longer exists', async () => {
    renderView([
      buildSeededTask({ id: 'T-2', title: 'Split the reader', dependsOn: ['T-gone'] }),
    ])

    expect(await screen.findByRole('button', { name: /Split the reader/ })).toBeTruthy()
    expect(screen.queryAllByTestId('task-map-arrow')).toHaveLength(0)
  })

  it('draws every card and every arrow of a two-Task cycle', async () => {
    renderView([
      buildSeededTask({ id: 'T-1', title: 'Rotate the tokens', dependsOn: ['T-2'] }),
      buildSeededTask({ id: 'T-2', title: 'Split the reader', dependsOn: ['T-1'] }),
    ])
    await screen.findByRole('button', { name: /Rotate the tokens/ })

    expect(cardIds()).toEqual(['T-1', 'T-2'])
    expect(arrowKeys()).toEqual(['T-1->T-2', 'T-2->T-1'])
  })

  it('draws every card and every arrow of a three-Task cycle', async () => {
    renderView([
      buildSeededTask({ id: 'T-1', title: 'Rotate the tokens', dependsOn: ['T-3'] }),
      buildSeededTask({ id: 'T-2', title: 'Split the reader', dependsOn: ['T-1'] }),
      buildSeededTask({ id: 'T-3', title: 'Archive the runs', dependsOn: ['T-2'] }),
    ])
    await screen.findByRole('button', { name: /Rotate the tokens/ })

    expect(cardIds()).toEqual(['T-1', 'T-2', 'T-3'])
    expect(arrowKeys()).toEqual(['T-1->T-2', 'T-2->T-3', 'T-3->T-1'])
  })

  it('offers no control to add, change or remove a dependency', async () => {
    renderView([
      buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
      buildSeededTask({ id: 'T-2', title: 'Split the reader', dependsOn: ['T-1'] }),
    ])
    await screen.findByRole('button', { name: /Rotate the tokens/ })

    expect(arrowKeys()).toEqual(['T-1->T-2'])
    const canvasControls = screen
      .getByTestId('task-map-surface')
      .querySelectorAll('button, a, input, select, [role="button"]')
    expect([...canvasControls].map((control) => control.getAttribute('data-task-id'))).toEqual([
      'T-1',
      'T-2',
    ])
    expect(screen.getByTestId('task-map-arrows').getAttribute('aria-hidden')).toBe('true')
  })
})

describe('TaskMapView label bands', () => {
  it('seeds one band per label the active Tasks carry, with No label / Other last', async () => {
    renderView(
      [
        buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
        buildSeededTask({ id: 'T-2', title: 'Split the reader' }),
        buildSeededTask({ id: 'T-3', title: 'Archive the runs', status: 'done' }),
      ],
      FIXTURE_PROJECT_ID,
      [buildLabelAssignment('T-1', 'auth'), buildLabelAssignment('T-2', 'api'), buildLabelAssignment('T-3', 'archived')],
    )
    await screen.findByRole('button', { name: /Rotate the tokens/ })

    expect(bandTitles()).toEqual(['api', 'auth', OTHER_REGION_TITLE])
  })

  it('draws a Task once, in the first band whose label it carries', async () => {
    renderView(
      [buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })],
      FIXTURE_PROJECT_ID,
      [buildLabelAssignment('T-1', 'auth', 'api')],
    )
    await screen.findByRole('button', { name: /Rotate the tokens/ })

    expect(bandTitles()).toEqual(['api', 'auth', OTHER_REGION_TITLE])
    expect(cardIds()).toEqual(['T-1'])
    expect(bandOfCard('T-1')).toBe('api')
  })

  it('draws a Task carrying no label in the No label / Other band', async () => {
    renderView(
      [
        buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
        buildSeededTask({ id: 'T-2', title: 'Split the reader' }),
      ],
      FIXTURE_PROJECT_ID,
      [buildLabelAssignment('T-1', 'auth')],
    )
    await screen.findByRole('button', { name: /Rotate the tokens/ })

    expect(bandOfCard('T-1')).toBe('auth')
    expect(bandOfCard('T-2')).toBe(OTHER_REGION_TITLE)
  })

  it('draws an arrow between two cards sitting in different bands', async () => {
    renderView(
      [
        buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
        buildSeededTask({ id: 'T-2', title: 'Split the reader', dependsOn: ['T-1'] }),
      ],
      FIXTURE_PROJECT_ID,
      [buildLabelAssignment('T-1', 'auth'), buildLabelAssignment('T-2', 'api')],
    )
    await screen.findByRole('button', { name: /Rotate the tokens/ })

    expect(bandOfCard('T-1')).toBe('auth')
    expect(bandOfCard('T-2')).toBe('api')
    expect(arrowKeys()).toEqual(['T-1->T-2'])
  })
})

describe('TaskMapView live Task changes', () => {
  it('draws a Task created while the map is open', async () => {
    const tasks = [buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })]
    const live = renderLiveView(tasks)
    await screen.findByRole('button', { name: /Rotate the tokens/ })

    tasks.push(buildSeededTask({ id: 'T-2', title: 'Split the reader' }))
    live.change({ taskId: 'T-2', reason: 'created' })

    expect(await screen.findByRole('button', { name: /Split the reader/ })).toBeTruthy()
  })

  it('removes a Completed Task and the arrow that pointed at it', async () => {
    const blocker = buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })
    const live = renderLiveView([
      blocker,
      buildSeededTask({ id: 'T-2', title: 'Split the reader', dependsOn: ['T-1'] }),
    ])
    await screen.findByRole('button', { name: /Rotate the tokens/ })
    expect(arrowKeys()).toEqual(['T-1->T-2'])

    blocker.status = 'done'
    live.change({ taskId: 'T-1', reason: 'completed' })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Rotate the tokens/ })).toBeNull()
    })
    expect(screen.queryAllByTestId('task-map-arrow')).toHaveLength(0)
  })

  it('moves a retitled and relabelled Task into its new band', async () => {
    const task = buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })
    const assignment = buildLabelAssignment('T-1', 'auth')
    const live = renderLiveView(
      [task, buildSeededTask({ id: 'T-2', title: 'Split the reader' })],
      [assignment, buildLabelAssignment('T-2', 'api')],
    )
    await screen.findByRole('button', { name: /Rotate the tokens/ })
    expect(bandOfCard('T-1')).toBe('auth')

    task.title = 'Rotate the keys'
    assignment.labels.splice(0, 1, ...buildLabelAssignment('T-1', 'api').labels)
    live.change({ taskId: 'T-1' })

    expect(await screen.findByRole('button', { name: /Rotate the keys/ })).toBeTruthy()
    expect(bandOfCard('T-1')).toBe('api')
  })

  it('answers a burst of change events with one further read of every Task', async () => {
    const tasks = [buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })]
    const live = renderLiveView(tasks)
    await screen.findByRole('button', { name: /Rotate the tokens/ })
    live.reads.length = 0

    tasks.push(buildSeededTask({ id: 'T-2', title: 'Split the reader' }))
    live.change({ taskId: 'T-2', reason: 'created' })
    tasks.push(buildSeededTask({ id: 'T-3', title: 'Archive the runs' }))
    live.change({ taskId: 'T-3', reason: 'created' })
    live.change()

    expect(await screen.findByRole('button', { name: /Archive the runs/ })).toBeTruthy()
    expect(cardIds()).toEqual(['T-1', 'T-2', 'T-3'])
    expect(live.reads).toHaveLength(2)
  })

  it('stops reading once the View is destroyed', async () => {
    const live = renderLiveView([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])
    await screen.findByRole('button', { name: /Rotate the tokens/ })
    live.reads.length = 0

    live.view.unmount()
    live.change()

    expect(live.reads).toEqual([])
  })

  it('follows the new Project and ignores the Project it left', async () => {
    const live = renderLiveView([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])
    await screen.findByRole('button', { name: /Rotate the tokens/ })
    await live.view.rerender({ api: live.api, context: viewContext('P-2') })
    await screen.findByText('No active Tasks')
    live.reads.length = 0

    live.change()
    expect(live.reads).toEqual([])

    live.change({ projectId: 'P-2', taskId: 'T-9', reason: 'created' })
    expect(live.reads).toEqual([{ projectId: 'P-2' }])
  })

  function renderLiveView(tasks: Task[], taskLabelAssignments: LabelAssignment[] = []) {
    const api = createMockFrontendOpenForgeApi({
      pluginId: PLUGIN_ID,
      projectId: FIXTURE_PROJECT_ID,
      tasks,
      taskLabelAssignments,
    })
    const view = render(TaskMapView, {
      props: { api, context: viewContext(FIXTURE_PROJECT_ID) },
    })

    return {
      api,
      view,
      reads: api.__testing.calls.taskActiveRequests,
      change: (event: Partial<TaskChangeEvent> = {}) =>
        api.__testing.registry.emitTaskChange({
          projectId: FIXTURE_PROJECT_ID,
          taskId: null,
          reason: 'updated',
          ...event,
        }),
    }
  }
})

describe('TaskMapView reads that outlive what asked for them', () => {
  it('keeps the cards on screen while a re-read runs', async () => {
    const controlled = renderControlledView()
    controlled.settle([buildTaskDetail({ id: 'T-1', title: 'Rotate the tokens' })])
    await screen.findByRole('button', { name: /Rotate the tokens/ })

    controlled.change()
    await tick()

    expect(screen.getByRole('button', { name: /Rotate the tokens/ })).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()

    controlled.settle([
      buildTaskDetail({ id: 'T-1', title: 'Rotate the tokens' }),
      buildTaskDetail({ id: 'T-2', title: 'Split the reader' }),
    ])

    expect(await screen.findByRole('button', { name: /Split the reader/ })).toBeTruthy()
  })

  it('keeps the map a failed re-read could not replace', async () => {
    const controlled = renderControlledView()
    controlled.settle([buildTaskDetail({ id: 'T-1', title: 'Rotate the tokens' })])
    await screen.findByRole('button', { name: /Rotate the tokens/ })

    controlled.change()
    controlled.fail(new Error('the host went away'))
    controlled.change()
    await waitFor(() => expect(controlled.reads).toHaveLength(3))

    expect(screen.getByRole('button', { name: /Rotate the tokens/ })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reports a first read that fails', async () => {
    const controlled = renderControlledView()

    controlled.fail(new Error('the host went away'))

    expect(await screen.findByText('Unable to load the Task Map')).toBeTruthy()
    expect(screen.getByText('the host went away')).toBeTruthy()
  })

  it('runs no queued re-read once the View is destroyed', async () => {
    const controlled = renderControlledView()
    controlled.settle([buildTaskDetail({ id: 'T-1', title: 'Rotate the tokens' })])
    await screen.findByRole('button', { name: /Rotate the tokens/ })

    controlled.change()
    await tick()
    controlled.change()
    controlled.view.unmount()
    controlled.settle([buildTaskDetail({ id: 'T-1', title: 'Rotate the tokens' })])
    await controlled.flush()

    expect(controlled.reads).toEqual([FIXTURE_PROJECT_ID, FIXTURE_PROJECT_ID])
  })

  it('leaves every re-read after a Project switch to the new Project', async () => {
    const controlled = renderControlledView()
    controlled.settle([buildTaskDetail({ id: 'T-1', title: 'Rotate the tokens' })])
    await screen.findByRole('button', { name: /Rotate the tokens/ })

    controlled.change()
    await tick()
    await controlled.view.rerender({ api: controlled.api, context: viewContext('P-2') })
    controlled.change({ projectId: 'P-2' })
    controlled.settle([buildTaskDetail({ id: 'T-1', title: 'Rotate the tokens' })])
    await controlled.flush()

    expect(controlled.reads).toEqual([FIXTURE_PROJECT_ID, FIXTURE_PROJECT_ID, 'P-2'])

    controlled.change({ projectId: 'P-2' })
    expect(controlled.reads).toHaveLength(3)

    controlled.settle([buildTaskDetail({ id: 'T-2', title: 'Split the reader', projectId: 'P-2' })])
    await controlled.flush()
    controlled.settle([buildTaskDetail({ id: 'T-2', title: 'Split the reader', projectId: 'P-2' })])

    expect(await screen.findByRole('button', { name: /Split the reader/ })).toBeTruthy()
    expect(controlled.reads).toEqual([FIXTURE_PROJECT_ID, FIXTURE_PROJECT_ID, 'P-2', 'P-2'])
  })

  function renderControlledView() {
    const base = createMockFrontendOpenForgeApi({
      pluginId: PLUGIN_ID,
      projectId: FIXTURE_PROJECT_ID,
    })
    const reads: string[] = []
    const waiting: { resolve: (tasks: ActiveTasks) => void; reject: (cause: Error) => void }[] = []
    const api: FrontendOpenForgeAPI = {
      ...base,
      tasks: {
        ...base.tasks,
        active: (projectId) =>
          new Promise<ActiveTasks>((resolve, reject) => {
            reads.push(projectId)
            waiting.push({ resolve, reject })
          }),
      },
    }
    const view = render(TaskMapView, {
      props: { api, context: viewContext(FIXTURE_PROJECT_ID) },
    })

    function next(): { resolve: (tasks: ActiveTasks) => void; reject: (cause: Error) => void } {
      const pending = waiting.shift()
      if (!pending) throw new Error('no read is waiting')
      return pending
    }

    return {
      api,
      view,
      reads,
      settle: (tasks: TaskDetail[]) => next().resolve({ tasks, related: [] }),
      flush: flushWrites,
      fail: (cause: Error) => next().reject(cause),
      change: (event: Partial<TaskChangeEvent> = {}) =>
        base.__testing.registry.emitTaskChange({
          projectId: FIXTURE_PROJECT_ID,
          taskId: null,
          reason: 'updated',
          ...event,
        }),
    }
  }
})

describe('TaskMapView card drag', () => {
  function cardPoint(taskId: string): { x: number; y: number } {
    const card = cardOf(taskId)
    return { x: Number.parseFloat(card.style.left), y: Number.parseFloat(card.style.top) }
  }

  function bandTop(title: string): number {
    const band = screen
      .getAllByTestId('task-map-region')
      .find((element) => element.querySelector('h2')?.textContent?.trim() === title)
    if (!band) throw new Error(`no band titled ${title}`)
    return Number.parseFloat(band.style.top)
  }

  async function dragCard(taskId: string, dx: number, dy: number, steps = 1): Promise<void> {
    const card = cardOf(taskId)
    await fireEvent(card, pointerEvent('pointerdown', 0, 0))
    for (let step = 1; step <= steps; step += 1) {
      await fireEvent(card, pointerEvent('pointermove', (dx * step) / steps, (dy * step) / steps))
    }
    await fireEvent(card, pointerEvent('pointerup', dx, dy))
  }

  it('rests a card where it is dropped inside its own band', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])
    const before = cardPoint('T-1')

    await dragCard('T-1', 60, 40)

    expect(cardPoint('T-1')).toEqual({ x: before.x + 60, y: before.y + 40 })
    expect(map.api.__testing.calls.navigationRequests).toEqual([])
  })

  it('returns a card dragged past its own band and leaves the Task alone', async () => {
    const map = await openMap(
      [
        buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
        buildSeededTask({ id: 'T-2', title: 'Split the reader' }),
      ],
      { labels: [buildLabelAssignment('T-1', 'api'), buildLabelAssignment('T-2', 'auth')] },
    )
    expect(bandOfCard('T-2')).toBe('auth')

    await dragCard('T-2', 0, -1000)

    expect(bandOfCard('T-2')).toBe('auth')
    expect(cardPoint('T-2').y).toBe(bandTop('auth') + REGION_HEADING_HEIGHT)
    expect(taskWrites(map.api)).toEqual([])
  })

  it('writes one position for one drag gesture', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])

    await dragCard('T-1', 80, 60, 12)
    await flushWrites()

    expect(map.positionWrites).toEqual([{ 'T-1': { region: null, x: 80, y: 60 } }])
  })

  it('restores a dragged position when the View is reopened', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])
    await dragCard('T-1', 60, 40)
    const dropped = cardPoint('T-1')

    await map.reopen()

    expect(cardPoint('T-1')).toEqual(dropped)
  })

  it('restores a dragged position after the app restarts', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])
    await dragCard('T-1', 60, 40)
    const dropped = cardPoint('T-1')

    await map.restart()

    expect(cardPoint('T-1')).toEqual(dropped)
  })

  it('restores every position of three cards dragged one after another', async () => {
    const map = await openMap([
      buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
      buildSeededTask({ id: 'T-2', title: 'Split the reader' }),
      buildSeededTask({ id: 'T-3', title: 'Archive the runs' }),
    ])

    await dragCard('T-1', 40, 30)
    await dragCard('T-2', 50, 60)
    await dragCard('T-3', 60, 90)
    const dropped = ['T-1', 'T-2', 'T-3'].map(cardPoint)

    await map.reopen()

    expect(['T-1', 'T-2', 'T-3'].map(cardPoint)).toEqual(dropped)
  })

  it('draws a card at its stored position rather than where layering would put it', async () => {
    const map = await openMap([
      buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
      buildSeededTask({ id: 'T-2', title: 'Split the reader', dependsOn: ['T-1'] }),
    ])
    const layered = cardPoint('T-2')

    await map.store('cardPositions', { 'T-2': { region: null, x: 0, y: 0 } })
    await map.reopen()

    expect(cardPoint('T-2').y).toBeLessThan(layered.y)
    expect(cardPoint('T-2').y).toBe(bandTop(OTHER_REGION_TITLE) + REGION_HEADING_HEIGHT)
  })

  it('lays a Task out again once its band changes, ignoring where it sat before', async () => {
    const task = buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })
    const assignment = buildLabelAssignment('T-1', 'auth')
    const map = await openMap([task, buildSeededTask({ id: 'T-2', title: 'Split the reader' })], {
      labels: [assignment, buildLabelAssignment('T-2', 'api')],
    })
    await dragCard('T-1', 120, 0)
    expect(cardPoint('T-1').x).toBe(CANVAS_PADDING + 120)

    assignment.labels.splice(0, 1, ...buildLabelAssignment('T-1', 'api').labels)
    map.change()

    await waitFor(() => expect(bandOfCard('T-1')).toBe('api'))
    expect(cardPoint('T-1').x).toBe(CANVAS_PADDING)
  })

  it('leaves every card alone for a position stored for a Task off the map', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])
    const layered = cardPoint('T-1')

    await map.store('cardPositions', { 'T-gone': { region: null, x: 300, y: 300 } })
    await map.reopen()

    expect(cardPoint('T-1')).toEqual(layered)
  })

  it('reads a position written for one Project for that Project alone', async () => {
    const map = await openMap([
      buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
      buildSeededTask({ id: 'T-9', title: 'Rotate the tokens', projectId: 'P-2' }),
    ])
    await dragCard('T-1', 60, 40)
    const dropped = cardPoint('T-1')

    await map.openProject('P-2')

    expect(cardPoint('T-9')).toEqual({ x: dropped.x - 60, y: dropped.y - 40 })
  })

  it('opens a Task clicked without dragging it', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])

    await fireEvent.click(cardOf('T-1'), { detail: 1 })

    expect(map.api.__testing.calls.navigationRequests).toEqual([{ viewId: 'board', taskId: 'T-1' }])
  })

  it('opens no Task on the click that ends a drag', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])

    await dragCard('T-1', 60, 40)
    await fireEvent.click(cardOf('T-1'), { detail: 1 })

    expect(map.api.__testing.calls.navigationRequests).toEqual([])
  })

  it('opens a Task activated from the keyboard after a card was dragged', async () => {
    const map = await openMap([
      buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' }),
      buildSeededTask({ id: 'T-2', title: 'Split the reader' }),
    ])

    await dragCard('T-1', 60, 40)
    await fireEvent.click(cardOf('T-2'))

    expect(map.api.__testing.calls.navigationRequests).toEqual([{ viewId: 'board', taskId: 'T-2' }])
  })

  it('does not reuse the position of the band a Task left and came back to', async () => {
    const task = buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })
    const assignment = buildLabelAssignment('T-1', 'auth')
    const map = await openMap([task, buildSeededTask({ id: 'T-2', title: 'Split the reader' })], {
      labels: [assignment, buildLabelAssignment('T-2', 'api')],
    })
    await dragCard('T-1', 120, 0)

    const relabel = (...names: string[]) => {
      assignment.labels.splice(0, assignment.labels.length, ...buildLabelAssignment('T-1', ...names).labels)
      map.change()
    }
    relabel('api')
    await waitFor(() => expect(bandOfCard('T-1')).toBe('api'))
    relabel('auth')
    await waitFor(() => expect(bandOfCard('T-1')).toBe('auth'))

    expect(cardPoint('T-1').x).toBe(CANVAS_PADDING)
  })

  it('keeps a dropped position that a re-read already in flight could not see', async () => {
    const map = await openMap([buildSeededTask({ id: 'T-1', title: 'Rotate the tokens' })])

    map.change()
    await dragCard('T-1', 60, 40)
    const dropped = cardPoint('T-1')
    await flushWrites()

    expect(cardPoint('T-1')).toEqual(dropped)
    await map.reopen()
    expect(cardPoint('T-1')).toEqual(dropped)
  })

  function taskWrites(api: ReturnType<typeof createMockFrontendOpenForgeApi>) {
    const { taskStatusUpdates, taskCreations, taskFollowUps, taskImplementationStarts } =
      api.__testing.calls
    return [...taskStatusUpdates, ...taskCreations, ...taskFollowUps, ...taskImplementationStarts]
  }

  interface OpenMapOptions {
    labels?: LabelAssignment[]
    projectId?: string
  }

  async function openMap(tasks: Task[], { labels = [], projectId = FIXTURE_PROJECT_ID }: OpenMapOptions = {}) {
    const positionWrites: JsonValue[] = []
    const storage = createHostStorage((key, value) => {
      if (key === 'cardPositions') positionWrites.push(value)
    })
    const build = () =>
      createMockFrontendOpenForgeApi({
        pluginId: PLUGIN_ID,
        projectId: FIXTURE_PROJECT_ID,
        tasks,
        taskLabelAssignments: labels,
        storage,
      })

    let api = build()
    const show = async (shown: string) => {
      render(TaskMapView, { props: { api, context: viewContext(shown) } })
      await screen.findByTestId('task-map-layer')
    }
    await show(projectId)

    return {
      get api() {
        return api
      },
      positionWrites,
      store: (key: string, value: JsonValue) => storage.project(projectId).set(key, value),
      change: () =>
        api.__testing.registry.emitTaskChange({ projectId, taskId: null, reason: 'updated' }),
      reopen: async () => {
        cleanup()
        await show(projectId)
      },
      restart: async () => {
        cleanup()
        api = build()
        await show(projectId)
      },
      openProject: async (other: string) => {
        cleanup()
        await show(other)
      },
    }
  }
})
