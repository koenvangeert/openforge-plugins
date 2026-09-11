// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import type { ActiveTasks, Task } from '@openforge-app/plugin-sdk/domain'
import type { FrontendOpenForgeAPI, OpenForgeContextSnapshot } from '@openforge-app/plugin-sdk/frontend'
import { createMockFrontendOpenForgeApi } from '@openforge-app/plugin-sdk/testing'
import TaskMapView from './TaskMapView.svelte'
import { buildSeededTask, buildTaskDetail, FIXTURE_PROJECT_ID } from '../__fixtures__/tasks'

const PLUGIN_ID = 'dev.kvg.task-map'

function viewContext(projectId: string | null): OpenForgeContextSnapshot {
  return { pluginId: PLUGIN_ID, projectId }
}

function renderView(tasks: Task[], projectId: string | null = FIXTURE_PROJECT_ID) {
  const api = createMockFrontendOpenForgeApi({
    pluginId: PLUGIN_ID,
    projectId: FIXTURE_PROJECT_ID,
    tasks,
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
