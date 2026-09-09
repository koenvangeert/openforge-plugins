<script lang="ts">
  import Maximize from '@lucide/svelte/icons/maximize'
  import X from '@lucide/svelte/icons/x'
  import ZoomIn from '@lucide/svelte/icons/zoom-in'
  import ZoomOut from '@lucide/svelte/icons/zoom-out'
  import type { Lens } from '@coldtea/pr-lens-schema'
  import type { Theme } from '@coldtea/pr-lens-renderer'
  import type { PluginTaskPaneProps } from '@openforge-app/plugin-sdk/frontend'
  import Button from '@openforge-app/plugin-sdk/ui/Button.svelte'
  import IconButton from '@openforge-app/plugin-sdk/ui/IconButton.svelte'
  import { renderStoredDiagram } from './prLensDiagram'
  import { diagramDetail } from './prLensDetails'
  import { hitTestDiagram, type DiagramTarget } from './prLensHitTest'
  import { diagramProvenance } from './prLensProvenance'
  import { requestDiagram } from './prLensRequest'
  import { latestAgentSessionId } from './prLensSession'
  import {
    DIAGRAM_UPDATED_EVENT,
    loadStoredDiagram,
    type DiagramUpdatedEvent,
    type StoredDiagram,
  } from './prLensStorage'
  import { observeDiagramTheme, resolveDiagramTheme } from './prLensTheme'
  import { viewChoices, WHOLE_DOCUMENT_VIEW } from './prLensViews'
  import {
    canZoomIn,
    canZoomOut,
    contentOffset,
    FIT_ZOOM,
    fitScale,
    ORIGIN,
    rescaleAround,
    resolveScale,
    stepDown,
    stepUp,
    wheelScale,
    zoomLabel,
    type Point,
    type ZoomState,
  } from './prLensZoom'

  const DRAG_SLOP_PX = 4

  interface Props extends PluginTaskPaneProps {}
  let { api, taskId, projectId }: Props = $props()

  let diagram = $state<StoredDiagram | null>(null)
  let currentSessionId = $state<string | null>(null)
  let loading = $state(true)
  let lens = $state<Lens | null>(null)
  let view = $state(WHOLE_DOCUMENT_VIEW)
  let theme = $state<Theme>('light')
  let requesting = $state(false)
  let requestNote = $state<string | null>(null)
  let requestFailed = $state(false)

  let zoom = $state<ZoomState>(FIT_ZOOM)
  let pan = $state({ x: 0, y: 0 })
  let viewportWidth = $state(0)
  let viewportHeight = $state(0)
  let canvas = $state<HTMLDivElement | null>(null)
  let viewport = $state<HTMLDivElement | null>(null)
  let selection = $state<DiagramTarget | null>(null)

  let framedFor: string | null = null
  let loadedTask: string | null = null

  let provenance = $derived(diagram ? diagramProvenance(diagram, currentSessionId) : null)
  let drawing = $derived(diagram
    ? renderStoredDiagram(diagram, { lens: lens ?? undefined, theme, view: view || undefined })
    : null)
  let lenses = $derived(diagram?.document.lenses ?? [])
  let views = $derived(drawing?.ok ? viewChoices(drawing.document) : [])
  let detail = $derived(drawing?.ok && selection ? diagramDetail(drawing.document, selection) : null)

  let fit = $derived(drawing?.ok
    ? fitScale(drawing, { width: viewportWidth, height: viewportHeight })
    : null)
  let scale = $derived(resolveScale(zoom, fit))
  let offset = $derived(drawing?.ok
    ? contentOffset(drawing, { width: viewportWidth, height: viewportHeight }, scale, pan)
    : ORIGIN)

  $effect(() => {
    theme = resolveDiagramTheme()
    return observeDiagramTheme((next) => { theme = next })
  })

  $effect(() => {
    const currentTaskId = taskId
    let active = true

    async function reload(): Promise<void> {
      const [stored, sessionId] = await Promise.all([
        loadStoredDiagram(api.storage, currentTaskId),
        latestAgentSessionId(api.tasks, currentTaskId),
      ])
      if (!active) return
      diagram = stored
      currentSessionId = sessionId
      reframe(`${currentTaskId}:${stored?.storedAt ?? 'none'}`, () => {
        lens = stored?.document.lenses[0] ?? null
        view = WHOLE_DOCUMENT_VIEW
        resetFraming()
      })
      loading = false
    }

    if (loadedTask !== currentTaskId) {
      loadedTask = currentTaskId
      diagram = null
      lens = null
      view = WHOLE_DOCUMENT_VIEW
      selection = null
      requestNote = null
      requestFailed = false
      loading = true
    }
    void reload()

    const subscription = api.events.on(DIAGRAM_UPDATED_EVENT, (payload: DiagramUpdatedEvent) => {
      if (payload?.taskId === currentTaskId) void reload()
    })

    return () => {
      active = false
      subscription.dispose()
    }
  })

  function reframe(key: string, apply: () => void): void {
    if (framedFor === key) return
    framedFor = key
    apply()
  }

  function resetFraming(): void {
    zoom = FIT_ZOOM
    pan = { x: 0, y: 0 }
    selection = null
  }

  function storedAtLabel(iso: string): string {
    const at = new Date(iso)
    return Number.isNaN(at.getTime()) ? iso : at.toLocaleString()
  }

  function beginPan(event: PointerEvent): void {
    if (event.button !== 0) return
    const origin = { x: event.clientX, y: event.clientY }
    const start = { ...pan }
    let moved = false
    const surface = event.currentTarget as HTMLElement
    surface.setPointerCapture(event.pointerId)

    const move = (moveEvent: PointerEvent): void => {
      const dx = moveEvent.clientX - origin.x
      const dy = moveEvent.clientY - origin.y
      if (Math.hypot(dx, dy) > DRAG_SLOP_PX) moved = true
      if (moved) pan = { x: start.x + dx, y: start.y + dy }
    }

    const end = (endEvent: PointerEvent): void => {
      surface.removeEventListener('pointermove', move)
      surface.removeEventListener('pointerup', end)
      surface.removeEventListener('pointercancel', end)
      surface.releasePointerCapture(endEvent.pointerId)
      if (!moved) select(endEvent)
    }

    surface.addEventListener('pointermove', move)
    surface.addEventListener('pointerup', end)
    surface.addEventListener('pointercancel', end)
  }

  function select(event: PointerEvent): void {
    if (!canvas || !drawing?.ok) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    selection = hitTestDiagram(drawing.atlas, {
      x: ((event.clientX - rect.left) / rect.width) * drawing.width,
      y: ((event.clientY - rect.top) / rect.height) * drawing.height,
    })
  }

  function reframeAround(target: number, anchor: Point): void {
    if (!drawing?.ok) return
    const framing = rescaleAround(target, anchor, {
      content: drawing,
      viewport: { width: viewportWidth, height: viewportHeight },
      scale,
      pan,
    })
    zoom = framing.zoom
    pan = framing.pan
  }

  function wheelZoom(event: WheelEvent): void {
    event.preventDefault()
    const box = viewport?.getBoundingClientRect()
    if (!box) return
    const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
    reframeAround(wheelScale(scale, pixels), {
      x: event.clientX - box.left,
      y: event.clientY - box.top,
    })
  }

  function stepZoom(next: (scale: number) => number): void {
    reframeAround(next(scale), { x: viewportWidth / 2, y: viewportHeight / 2 })
  }

  async function request(): Promise<void> {
    if (requesting) return
    requesting = true
    requestNote = null
    requestFailed = false
    try {
      const outcome = await requestDiagram(api, { taskId, projectId })
      if (outcome.status === 'failed') {
        requestFailed = true
        requestNote = `The diagram could not be requested: ${outcome.message}.`
      } else {
        requestNote = outcome.status === 'delivered'
          ? 'Sent to the agent. The diagram appears here when it answers.'
          : 'Queued behind the agent’s current work. The diagram appears here when it answers.'
      }
    } finally {
      requesting = false
    }
  }
</script>

<section class="pr-lens-pane">
  <header>
    <div class="toolbar">
      <Button variant="primary" size="sm" onclick={request} disabled={requesting}>
        {requesting ? 'Requesting…' : diagram ? 'Regenerate diagram' : 'Generate diagram'}
      </Button>

      {#if lenses.length > 1}
        <label class="picker">
          <span>Lens</span>
          <select bind:value={lens} onchange={resetFraming}>
            {#each lenses as option (option)}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </label>
      {/if}

      {#if views.length > 0}
        <label class="picker">
          <span>View</span>
          <select bind:value={view} onchange={resetFraming}>
            <option value={WHOLE_DOCUMENT_VIEW}>Whole diagram</option>
            {#each views as option (option.id)}
              <option value={option.id}>{' '.repeat(option.depth * 2)}{option.title}</option>
            {/each}
          </select>
        </label>
      {/if}

      {#if drawing?.ok}
        <div class="zoom">
          <IconButton
            label="Zoom out"
            size="sm"
            onclick={() => { stepZoom(stepDown) }}
            disabled={!canZoomOut(zoom, fit)}
          >
            <ZoomOut size={16} />
          </IconButton>
          <span class="zoom-label">{zoomLabel(zoom, fit)}</span>
          <IconButton
            label="Zoom in"
            size="sm"
            onclick={() => { stepZoom(stepUp) }}
            disabled={!canZoomIn(zoom, fit)}
          >
            <ZoomIn size={16} />
          </IconButton>
          <IconButton label="Fit to pane" size="sm" onclick={resetFraming}>
            <Maximize size={16} />
          </IconButton>
        </div>
      {/if}
    </div>

    {#if provenance}
      <p class="provenance">
        <span>{provenance.repo}</span>
        <span class="sha">{provenance.headShortSha}</span>
        {#if provenance.headRef}<span>{provenance.headRef}</span>{/if}
        <span>stored {storedAtLabel(provenance.storedAt)}</span>
        {#if provenance.freshness === 'stale'}
          <span class="marker stale">Stale, a later session has run</span>
        {/if}
        {#if provenance.cleanliness === 'dirty'}
          <span class="marker dirty">Covers uncommitted work</span>
        {:else if provenance.cleanliness === 'unknown'}
          <span class="marker unknown">Uncommitted work unknown</span>
        {/if}
      </p>
    {/if}

    {#if requestNote}
      <p class="message" class:error={requestFailed} role={requestFailed ? 'alert' : 'status'}>
        {requestNote}
      </p>
    {/if}
  </header>

  {#if loading}
    <p class="message">Loading the PR Lens diagram…</p>
  {:else if !diagram}
    <p class="message">
      No diagram yet. Generate one and the agent will describe what this task changed.
    </p>
  {:else if drawing && !drawing.ok}
    <p class="message error" role="alert">{drawing.message}</p>
  {:else if drawing}
    <div class="stage">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        bind:this={viewport}
        class="viewport"
        bind:clientWidth={viewportWidth}
        bind:clientHeight={viewportHeight}
        onpointerdown={beginPan}
        onwheel={wheelZoom}
      >
        <div
          bind:this={canvas}
          class="canvas"
          style:width="{drawing.width}px"
          style:height="{drawing.height}px"
          style:transform="translate({offset.x}px, {offset.y}px) scale({scale})"
        >
          {@html drawing.svg}
        </div>
      </div>

      {#if detail}
        <aside class="details">
          <div class="details-head">
            <h3>{detail.title}</h3>
            <IconButton label="Close details" size="sm" onclick={() => { selection = null }}>
              <X size={16} />
            </IconButton>
          </div>
          {#if detail.subtitle}<p class="subtitle">{detail.subtitle}</p>{/if}
          <p class="badges">
            {#each detail.badges as badge (badge)}<span class="badge">{badge}</span>{/each}
            {#if detail.delta}<span class="badge delta">{detail.delta}</span>{/if}
          </p>
          {#if detail.context}<p class="context">{detail.context}</p>{/if}
          {#if detail.summary}
            <p>{detail.summary}</p>
          {:else}
            <p class="absent">The agent wrote no summary for this one.</p>
          {/if}
          {#if detail.files.length > 0}
            <ul>
              {#each detail.files as file (file)}<li>{file}</li>{/each}
            </ul>
          {/if}
        </aside>
      {/if}
    </div>
  {/if}
</section>

<style>
  .pr-lens-pane,
  header,
  .details {
    display: flex;
    flex-direction: column;
  }

  .pr-lens-pane {
    color: var(--of-text);
    font-family: var(--of-font-sans);
    gap: var(--of-space3);
    height: 100%;
    min-height: 0;
    padding: var(--of-space3);
  }

  header {
    gap: var(--of-space2);
  }

  p,
  h3 {
    margin: 0;
  }

  .toolbar,
  .provenance,
  .picker,
  .zoom,
  .badges {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: var(--of-space2);
  }

  .zoom {
    gap: var(--of-space1);
    margin-inline-start: auto;
  }

  .zoom-label {
    color: var(--of-text-secondary);
    font-size: var(--of-text-xs);
    font-variant-numeric: tabular-nums;
    min-width: 3.5ch;
    text-align: center;
  }

  .picker > span,
  .provenance {
    color: var(--of-text-muted);
    font-size: var(--of-text-xs);
  }

  select {
    background: var(--of-field);
    border: var(--of-border-width) solid var(--of-border);
    border-radius: var(--of-radius-control);
    color: var(--of-text);
    font-family: inherit;
    font-size: var(--of-text-sm);
    height: var(--of-control-height-compact);
    padding-inline: var(--of-space2);
  }

  .sha {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  .marker {
    border-radius: var(--of-radius-control);
    padding: 0 var(--of-space1);
  }

  .stale {
    background: var(--of-status-warning-subtle);
    color: var(--of-on-status-warning);
  }

  .dirty {
    background: var(--of-status-danger-subtle);
    color: var(--of-on-status-danger);
  }

  .unknown {
    background: var(--of-status-neutral-subtle);
    color: var(--of-on-status-neutral);
  }

  .message {
    background: var(--of-surface-subtle);
    border-radius: var(--of-radius-container);
    color: var(--of-text-secondary);
    padding: var(--of-space2) var(--of-space3);
  }

  .message.error {
    background: var(--of-danger-subtle);
    color: var(--of-text);
  }

  .stage {
    display: flex;
    flex: 1;
    gap: var(--of-space3);
    min-height: 0;
  }

  .viewport {
    background: var(--of-surface-subtle);
    border: var(--of-border-width) solid var(--of-border);
    border-radius: var(--of-radius-container);
    cursor: grab;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    position: relative;
    touch-action: none;
  }

  .viewport:active {
    cursor: grabbing;
  }

  .canvas {
    inset-block-start: 0;
    inset-inline-start: 0;
    position: absolute;
    transform-origin: 0 0;
  }

  .canvas :global(svg) {
    display: block;
  }

  .details {
    background: var(--of-surface);
    border: var(--of-border-width) solid var(--of-border);
    border-radius: var(--of-radius-container);
    flex: 0 0 18rem;
    gap: var(--of-space2);
    overflow: auto;
    padding: var(--of-space3);
  }

  .details-head {
    align-items: start;
    display: flex;
    gap: var(--of-space2);
    justify-content: space-between;
  }

  h3 {
    font-size: var(--of-text-md);
    font-weight: var(--of-weight-medium);
  }

  .subtitle,
  .context,
  .absent {
    color: var(--of-text-muted);
    font-size: var(--of-text-xs);
  }

  .badge {
    background: var(--of-status-neutral-subtle);
    border-radius: var(--of-radius-round);
    color: var(--of-on-status-neutral);
    font-size: var(--of-text-xs);
    padding: 0 var(--of-space2);
  }

  .badge.delta {
    background: var(--of-accent-subtle);
    color: var(--of-on-accent-subtle);
  }

  ul {
    display: flex;
    flex-direction: column;
    font-size: var(--of-text-xs);
    gap: var(--of-space1);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    overflow-wrap: anywhere;
  }
</style>
