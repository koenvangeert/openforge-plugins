// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/svelte'
import type { GraphDoc } from '@coldtea/pr-lens-schema'
import type { TaskDetail } from '@openforge-app/plugin-sdk/domain'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import type { AgentSession } from '@openforge-app/plugin-sdk'
import { TaskFollowUpError } from '@openforge-app/plugin-sdk'
import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentSession } from './__fixtures__/agentSession'
import {
  detailedGraphDocInput,
  twoLensGraphDocInput,
  undrawableGraphDocInput,
  validGraphDocInput,
  viewTreeGraphDocInput,
} from './__fixtures__/graphDoc'
import { renderStoredDiagram } from './prLensDiagram'
import PrLensTaskPane from './PrLensTaskPane.svelte'
import { DIAGRAM_STORAGE_KEY, type StoredDiagram } from './prLensStorage'

const PROJECT_ID = 'P-1'
const TASK_ID = 'T-1'
const SESSION_ID = 'S-1'

function storedDiagram(overrides: Partial<StoredDiagram> = {}): StoredDiagram {
  return {
    document: validGraphDocInput() as unknown as GraphDoc,
    sessionId: SESSION_ID,
    storedAt: '2026-09-08T10:00:00.000Z',
    cleanliness: 'clean',
    ...overrides,
  }
}

function taskDetail(): TaskDetail {
  return {
    id: TASK_ID,
    status: 'doing',
    projectId: PROJECT_ID,
    title: TASK_ID,
    dependsOn: [],
    createdAt: 0,
    updatedAt: 0,
    promptPreview: '',
    labels: [],
    sourceTicketUrl: null,
    prompt: '',
    agent: null,
    permissionMode: null,
    worktreeSource: null,
    worktreeBranch: null,
    titleSource: null,
    titleGeneratedAt: null,
  }
}

async function mount(options: {
  diagram?: StoredDiagram | null
  sendFollowUp?: FrontendOpenForgeAPI['tasks']['sendFollowUp']
  sessions?: AgentSession[]
} = {}) {
  const registry = createOpenForgeRegistryFake({
    pluginId: 'dev.kvg.pr-lens',
    projectId: PROJECT_ID,
    taskId: TASK_ID,
    agentSessions: options.sessions ?? [agentSession(SESSION_ID, TASK_ID, 1)],
  })
  if (options.diagram) {
    await registry.storage.task(TASK_ID).set(DIAGRAM_STORAGE_KEY, options.diagram as never)
  }

  const base = registry.frontendApi as FrontendOpenForgeAPI
  const api: FrontendOpenForgeAPI = options.sendFollowUp
    ? { ...base, tasks: { ...base.tasks, sendFollowUp: options.sendFollowUp } }
    : base

  const view = render(PrLensTaskPane, {
    props: {
      api,
      context: api.context.getSnapshot(),
      taskId: TASK_ID,
      task: taskDetail(),
      projectId: PROJECT_ID,
    },
  })

  return { api, registry, view }
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function diagramSvg(container: HTMLElement): SVGSVGElement | null {
  return container.querySelector('.canvas svg')
}

afterEach(() => {
  document.documentElement.removeAttribute('data-theme-appearance')
})

function clickNode(container: HTMLElement, document_: unknown, nodeId: string): void {
  const drawn = renderStoredDiagram(storedDiagram({ document: document_ as GraphDoc }), { theme: 'light' })
  if (!drawn.ok) throw new Error(drawn.message)
  const box = drawn.atlas.nodes[nodeId]

  const canvas = container.querySelector('.canvas') as HTMLElement
  canvas.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: drawn.width,
    height: drawn.height,
    right: drawn.width,
    bottom: drawn.height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })

  const viewport = container.querySelector('.viewport') as HTMLElement
  const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 }
  viewport.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true, ...at }))
  viewport.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true, ...at }))
}

describe('PrLensTaskPane', () => {
  it('offers the request control and an empty state when the task has no diagram', async () => {
    const { view } = await mount()
    await settle()

    expect(screen.getByText(/No diagram yet/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Generate diagram' })).toBeTruthy()
    expect(diagramSvg(view.container)).toBeNull()
  })

  it('offers no request control when the task has no agent session', async () => {
    await mount({ sessions: [] })
    await settle()

    expect(screen.getByText(/no agent session/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /diagram/ })).toBeNull()
  })

  it('draws a diagram stored before the task lost its session', async () => {
    const { view } = await mount({ diagram: storedDiagram(), sessions: [] })
    await settle()

    expect(diagramSvg(view.container)).toBeTruthy()
  })

  it('draws the stored document', async () => {
    const { view } = await mount({ diagram: storedDiagram() })
    await settle()

    expect(diagramSvg(view.container)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Regenerate diagram' })).toBeTruthy()
  })

  it('shows the provenance of a diagram from the current session', async () => {
    await mount({ diagram: storedDiagram() })
    await settle()

    expect(screen.getByText('acme/app')).toBeTruthy()
    expect(screen.getByText('bbbbbbb')).toBeTruthy()
    expect(screen.queryByText(/Stale/)).toBeNull()
    expect(screen.queryByText(/uncommitted/i)).toBeNull()
  })

  it('marks a diagram from an earlier session stale without hiding it', async () => {
    const { view } = await mount({ diagram: storedDiagram({ sessionId: 'S-0' }) })
    await settle()

    expect(screen.getByText(/Stale, a later session has run/)).toBeTruthy()
    expect(diagramSvg(view.container)).toBeTruthy()
  })

  it('marks a diagram the agent reported dirty', async () => {
    await mount({ diagram: storedDiagram({ cleanliness: 'dirty' }) })
    await settle()

    expect(screen.getByText('Covers uncommitted work')).toBeTruthy()
  })

  it('shows unreported cleanliness as unknown rather than clean', async () => {
    await mount({ diagram: storedDiagram({ cleanliness: null }) })
    await settle()

    expect(screen.getByText('Uncommitted work unknown')).toBeTruthy()
  })

  it('redraws the diagram when the host switches appearance', async () => {
    document.documentElement.setAttribute('data-theme-appearance', 'light')
    const { view } = await mount({ diagram: storedDiagram() })
    await settle()
    const light = diagramSvg(view.container)?.outerHTML

    document.documentElement.setAttribute('data-theme-appearance', 'dark')
    await settle()

    expect(diagramSvg(view.container)?.outerHTML).not.toBe(light)
  })

  it('offers no lens selector for a single-lens document', async () => {
    await mount({ diagram: storedDiagram() })
    await settle()

    expect(screen.queryByLabelText('Lens')).toBeNull()
  })

  it('switches lenses on a document that declares two', async () => {
    const { view } = await mount({
      diagram: storedDiagram({ document: twoLensGraphDocInput() as unknown as GraphDoc }),
    })
    await settle()

    const selector = screen.getByLabelText('Lens') as HTMLSelectElement
    expect(selector.value).toBe('architecture')
    const architecture = diagramSvg(view.container)?.outerHTML

    await fireEvent.change(selector, { target: { value: 'data-flow' } })

    expect(diagramSvg(view.container)?.outerHTML).not.toBe(architecture)
  })

  it('names the failure instead of leaving the tab blank when a document cannot be drawn', async () => {
    const { view } = await mount({
      diagram: storedDiagram({ document: undrawableGraphDocInput() as unknown as GraphDoc }),
    })
    await settle()

    expect(screen.getByRole('alert').textContent).toContain('NO_FLOW_IN_SCOPE')
    expect(diagramSvg(view.container)).toBeNull()
  })

  it('repaints when the agent stores a new document for this task', async () => {
    const { api, registry, view } = await mount()
    await settle()
    expect(diagramSvg(view.container)).toBeNull()

    await registry.storage.task(TASK_ID).set(DIAGRAM_STORAGE_KEY, storedDiagram() as never)
    await api.events.emit('pr-lens.diagram-updated', { taskId: TASK_ID })
    await settle()

    expect(diagramSvg(view.container)).toBeTruthy()
  })

  it('ignores a document stored for a different task', async () => {
    const { api, registry, view } = await mount()
    await settle()

    await registry.storage.task(TASK_ID).set(DIAGRAM_STORAGE_KEY, storedDiagram() as never)
    await api.events.emit('pr-lens.diagram-updated', { taskId: 'T-other' })
    await settle()

    expect(diagramSvg(view.container)).toBeNull()
  })

  it('reports a delivered request', async () => {
    await mount({
      sendFollowUp: vi.fn(async () => ({
        taskId: TASK_ID,
        sessionId: SESSION_ID,
        disposition: 'delivered' as const,
      })),
    })
    await settle()

    await fireEvent.click(screen.getByRole('button', { name: 'Generate diagram' }))
    await settle()

    expect(screen.getByRole('status').textContent).toContain('Sent to the agent')
  })

  it('reports a queued request as waiting behind the agent', async () => {
    await mount({
      sendFollowUp: vi.fn(async () => ({
        taskId: TASK_ID,
        sessionId: SESSION_ID,
        disposition: 'queued' as const,
      })),
    })
    await settle()

    await fireEvent.click(screen.getByRole('button', { name: 'Generate diagram' }))
    await settle()

    expect(screen.getByRole('status').textContent).toContain('Queued')
  })

  it('reports a failed request and keeps showing the stored diagram', async () => {
    const { view } = await mount({
      diagram: storedDiagram(),
      sendFollowUp: vi.fn(async () => {
        throw new TaskFollowUpError('NO_SESSION', 'no session')
      }),
    })
    await settle()

    await fireEvent.click(screen.getByRole('button', { name: 'Regenerate diagram' }))
    await settle()

    expect(screen.getByRole('alert').textContent).toContain('no Agent Session')
    expect(diagramSvg(view.container)).toBeTruthy()
  })

  it('ignores a second click while a request is in flight', async () => {
    let release = (): void => undefined
    const pending = new Promise<void>((resolve) => { release = () => resolve() })
    const sendFollowUp = vi.fn(async () => {
      await pending
      return { taskId: TASK_ID, sessionId: SESSION_ID, disposition: 'delivered' as const }
    })
    await mount({ sendFollowUp })
    await settle()

    const button = screen.getByRole('button', { name: 'Generate diagram' })
    await fireEvent.click(button)
    await fireEvent.click(screen.getByRole('button', { name: 'Requesting…' }))

    expect(sendFollowUp).toHaveBeenCalledTimes(1)
    release()
    await settle()
  })

  it('steps the zoom level and returns to fit', async () => {
    await mount({ diagram: storedDiagram() })
    await settle()

    expect(screen.getByText('100%')).toBeTruthy()

    await fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByText('125%')).toBeTruthy()

    await fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(screen.getByText('75%')).toBeTruthy()

    await fireEvent.click(screen.getByRole('button', { name: 'Fit to pane' }))
    expect(screen.getByText('100%')).toBeTruthy()
  })

  it('stops zooming out at the smallest step', async () => {
    await mount({ diagram: storedDiagram() })
    await settle()

    for (let step = 0; step < 6; step += 1) {
      const out = screen.getByRole('button', { name: 'Zoom out' }) as HTMLButtonElement
      if (out.disabled) break
      await fireEvent.click(out)
    }

    expect(screen.getByText('25%')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Zoom out' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('zooms on a plain scroll, without a modifier key', async () => {
    const { view } = await mount({ diagram: storedDiagram() })
    await settle()

    const viewport = view.container.querySelector('.viewport') as HTMLElement
    await fireEvent.wheel(viewport, { deltaY: -100 })
    expect(screen.getByText('122%')).toBeTruthy()

    await fireEvent.wheel(viewport, { deltaY: 100 })
    expect(screen.getByText('100%')).toBeTruthy()
  })

  it('keeps the zoom level when the same document is reloaded', async () => {
    const { api } = await mount({ diagram: storedDiagram() })
    await settle()
    await fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByText('125%')).toBeTruthy()

    await api.events.emit('pr-lens.diagram-updated', { taskId: TASK_ID })
    await settle()

    expect(screen.getByText('125%')).toBeTruthy()
  })

  it('reframes when the agent stores a newer document', async () => {
    const { api, registry } = await mount({ diagram: storedDiagram() })
    await settle()
    await fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByText('125%')).toBeTruthy()

    await registry.storage
      .task(TASK_ID)
      .set(DIAGRAM_STORAGE_KEY, storedDiagram({ storedAt: '2026-09-09T10:00:00.000Z' }) as never)
    await api.events.emit('pr-lens.diagram-updated', { taskId: TASK_ID })
    await settle()

    expect(screen.getByText('100%')).toBeTruthy()
  })

  it('opens the details of the node a click landed on', async () => {
    const { view } = await mount({
      diagram: storedDiagram({ document: detailedGraphDocInput() as unknown as GraphDoc }),
    })
    await settle()

    clickNode(view.container, detailedGraphDocInput(), 'tab')

    expect(await screen.findByRole('heading', { name: 'PR Lens tab' })).toBeTruthy()
    expect(screen.getByText('Draws the stored document and offers the request control.')).toBeTruthy()
    expect(screen.getByText('src/PrLensTaskPane.svelte:1-40')).toBeTruthy()
  })

  it('says so when the agent wrote no summary for what was clicked', async () => {
    const { view } = await mount({ diagram: storedDiagram() })
    await settle()

    clickNode(view.container, validGraphDocInput(), 'tab')

    expect(await screen.findByText('The agent wrote no summary for this one.')).toBeTruthy()
  })

  it('closes the details panel', async () => {
    const { view } = await mount({
      diagram: storedDiagram({ document: detailedGraphDocInput() as unknown as GraphDoc }),
    })
    await settle()
    clickNode(view.container, detailedGraphDocInput(), 'tab')
    await screen.findByRole('heading', { name: 'PR Lens tab' })

    await fireEvent.click(screen.getByRole('button', { name: 'Close details' }))

    expect(screen.queryByRole('heading', { name: 'PR Lens tab' })).toBeNull()
  })

  it('offers no view picker for a document without drill-downs', async () => {
    await mount({ diagram: storedDiagram() })
    await settle()

    expect(screen.queryByLabelText('View')).toBeNull()
  })

  it('narrows the diagram to a chosen drill-down view', async () => {
    const { view } = await mount({
      diagram: storedDiagram({ document: viewTreeGraphDocInput() as unknown as GraphDoc }),
    })
    await settle()

    const picker = screen.getByLabelText('View') as HTMLSelectElement
    expect(picker.value).toBe('')
    const whole = diagramSvg(view.container)?.outerHTML

    await fireEvent.change(picker, { target: { value: 'interface-tab' } })

    expect(diagramSvg(view.container)?.outerHTML).not.toBe(whole)
  })
})
