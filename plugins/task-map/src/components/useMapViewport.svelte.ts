import {
  canvasTransform,
  formatZoom,
  INITIAL_VIEWPORT,
  isInitialViewport,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  wheelZoomFactor,
  zoomAt,
  ZOOM_STEP,
  type CanvasPoint,
  type Viewport,
} from '../lib/viewport'

export type MapViewport = ReturnType<typeof useMapViewport>

export function useMapViewport() {
  let viewport = $state<Viewport>(INITIAL_VIEWPORT)
  let surface: HTMLElement | null = null

  function surfaceCentre(): CanvasPoint {
    return { x: (surface?.clientWidth ?? 0) / 2, y: (surface?.clientHeight ?? 0) / 2 }
  }

  return {
    get scale(): number {
      return viewport.scale
    },
    get transform(): string {
      return canvasTransform(viewport)
    },
    get zoomLabel(): string {
      return formatZoom(viewport)
    },
    get canZoomIn(): boolean {
      return viewport.scale < MAX_ZOOM
    },
    get canZoomOut(): boolean {
      return viewport.scale > MIN_ZOOM
    },
    get isReset(): boolean {
      return isInitialViewport(viewport)
    },
    attach(element: HTMLElement | null): void {
      surface = element
    },
    zoomIn(): void {
      viewport = zoomAt(viewport, ZOOM_STEP, surfaceCentre())
    },
    zoomOut(): void {
      viewport = zoomAt(viewport, 1 / ZOOM_STEP, surfaceCentre())
    },
    zoomByWheel(deltaY: number, anchor: CanvasPoint): void {
      viewport = zoomAt(viewport, wheelZoomFactor(deltaY), anchor)
    },
    pan(dx: number, dy: number): void {
      viewport = panBy(viewport, dx, dy)
    },
    reset(): void {
      viewport = { ...INITIAL_VIEWPORT }
    },
  }
}
