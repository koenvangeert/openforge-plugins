import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import type { JsonValue, PluginStorage } from '@openforge-app/plugin-sdk'
import type { Task } from '@openforge-app/plugin-sdk/domain'
import type { OpenForgeContextSnapshot } from '@openforge-app/plugin-sdk/frontend'
import { createMockFrontendOpenForgeApi } from '@openforge-app/plugin-sdk/testing'
import { createHostStorage } from '../__fixtures__/storage'
import TaskMapView from './TaskMapView.svelte'
import { FIXTURE_PROJECT_ID, type LabelAssignment } from '../__fixtures__/tasks'
import { pointerEvent } from '../__fixtures__/pointer'
import { cardKey } from '../lib/cards'
import { bandWidthFor, MIN_BAND_HEIGHT, type Band } from '../lib/bands'

export const PLUGIN_ID = 'dev.kvg.task-map'

export function viewContext(projectId: string | null): OpenForgeContextSnapshot {
  return { pluginId: PLUGIN_ID, projectId }
}

export function layer(): HTMLElement {
  return screen.getByTestId('task-map-layer')
}

export function cards(): HTMLElement[] {
  return [...layer().querySelectorAll<HTMLElement>('[data-card-key]')]
}

export function cardIds(): string[] {
  return cards().map((card) => card.dataset.taskId ?? '')
}

export function arrowKeys(): (string | undefined)[] {
  return screen
    .getAllByTestId('task-map-arrow')
    .flatMap((arrow) => arrow.dataset.arrow ?? [])
    .sort()
}

export function titleOf(band: HTMLElement): string {
  return band.querySelector('h2')?.textContent?.trim() ?? ''
}

export function labelOf(band: HTMLElement): string | null {
  return band.dataset.other === 'true' ? null : titleOf(band)
}

export function bandTitles(): string[] {
  return screen.getAllByTestId('task-map-band').map(titleOf)
}

export function boxOf(title: string): HTMLElement {
  const box = screen.getAllByTestId('task-map-band').find((band) => titleOf(band) === title)
  if (!box) throw new Error(`no band titled ${title}`)
  return box
}

export function headingOf(title: string): HTMLElement {
  const heading = boxOf(title).querySelector<HTMLElement>('[data-band-handle]')
  if (!heading) throw new Error(`no heading for the ${title} band`)
  return heading
}

export function handleOf(title: string): HTMLElement {
  const handle = boxOf(title).querySelector<HTMLElement>('[data-band-resize]')
  if (!handle) throw new Error(`no resize handle for the ${title} band`)
  return handle
}

export function rectOf(title: string): Band {
  const box = boxOf(title)
  return {
    label: labelOf(box),
    x: Number.parseFloat(box.style.left),
    y: Number.parseFloat(box.style.top),
    width: Number.parseFloat(box.style.width),
    height: Number.parseFloat(box.style.height),
  }
}

export function cardIn(title: string, taskId: string): HTMLElement {
  const key = cardKey(labelOf(boxOf(title)), taskId)
  const card = cards().find((one) => one.dataset.cardKey === key)
  if (!card) throw new Error(`no card for Task ${taskId} in the ${title} band`)
  return card
}

export function cardIdsIn(title: string): string[] {
  const label = labelOf(boxOf(title))
  return cards().flatMap((card) =>
    card.dataset.cardKey === cardKey(label, card.dataset.taskId ?? '')
      ? [card.dataset.taskId ?? '']
      : [],
  )
}

export function bandsOfCard(taskId: string): string[] {
  return screen
    .getAllByTestId('task-map-band')
    .filter((box) => cards().some((card) => card.dataset.cardKey === cardKey(labelOf(box), taskId)))
    .map(titleOf)
}

export function bandOfCard(taskId: string): string {
  const [only, ...rest] = bandsOfCard(taskId)
  if (only === undefined) throw new Error(`the card for Task ${taskId} sits in no band`)
  if (rest.length > 0) throw new Error(`Task ${taskId} is drawn in ${rest.length + 1} bands`)
  return only
}

export function cardOf(taskId: string): HTMLElement {
  return cardIn(bandOfCard(taskId), taskId)
}

export function pointOf(element: HTMLElement): { x: number; y: number } {
  return { x: Number.parseFloat(element.style.left), y: Number.parseFloat(element.style.top) }
}

export function cardPoint(taskId: string): { x: number; y: number } {
  return pointOf(cardOf(taskId))
}

export async function drag(element: HTMLElement, dx: number, dy: number, steps = 1): Promise<void> {
  await fireEvent(element, pointerEvent('pointerdown', 0, 0))
  for (let step = 1; step <= steps; step += 1) {
    await fireEvent(element, pointerEvent('pointermove', (dx * step) / steps, (dy * step) / steps))
  }
  await fireEvent(element, pointerEvent('pointerup', dx, dy))
}

export function flushWrites(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export function band(label: string | null, x: number, y: number, width = bandWidthFor(4)): Band {
  return { label, x, y, width, height: MIN_BAND_HEIGHT }
}

export function renderView(
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

export function taskWrites(api: ReturnType<typeof createMockFrontendOpenForgeApi>) {
  const { taskStatusUpdates, taskCreations, taskFollowUps, taskImplementationStarts } =
    api.__testing.calls
  return [...taskStatusUpdates, ...taskCreations, ...taskFollowUps, ...taskImplementationStarts]
}

export interface OpenMapOptions {
  labels?: LabelAssignment[]
  projectId?: string
}

export async function openMap(
  tasks: Task[],
  { labels = [], projectId = FIXTURE_PROJECT_ID }: OpenMapOptions = {},
) {
  const positionWrites: JsonValue[] = []
  const bandWrites: JsonValue[] = []
  const host = createHostStorage((key, value) => {
    if (key === 'cardPositions') positionWrites.push(value)
    if (key === 'bands') bandWrites.push(value)
  })
  let refused: string | null = null
  const storage: PluginStorage = {
    ...host,
    project: (id) => {
      const scope = host.project(id)
      return {
        ...scope,
        set: (key, value) =>
          key === refused
            ? Promise.reject(new Error('the host went away'))
            : scope.set(key, value),
      }
    },
  }
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
    bandWrites,
    refuse: (key: string) => {
      refused = key
    },
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
