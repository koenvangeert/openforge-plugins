export interface Viewport {
  scale: number
  offsetX: number
  offsetY: number
}

export interface CanvasPoint {
  x: number
  y: number
}

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4
export const ZOOM_STEP = 1.25

export const INITIAL_VIEWPORT: Viewport = { scale: 1, offsetX: 0, offsetY: 0 }

// Exponential, not a fixed step: a trackpad's small deltas must zoom as smoothly
// as a mouse wheel's large ones.
const WHEEL_ZOOM_DIVISOR = 240

function clampScale(scale: number): number {
  return Math.min(Math.max(scale, MIN_ZOOM), MAX_ZOOM)
}

export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY / WHEEL_ZOOM_DIVISOR)
}

export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, offsetX: viewport.offsetX + dx, offsetY: viewport.offsetY + dy }
}

export function zoomAt(viewport: Viewport, factor: number, anchor: CanvasPoint): Viewport {
  const scale = clampScale(viewport.scale * factor)
  if (scale === viewport.scale) return viewport

  const worldX = (anchor.x - viewport.offsetX) / viewport.scale
  const worldY = (anchor.y - viewport.offsetY) / viewport.scale
  return {
    scale,
    offsetX: anchor.x - worldX * scale,
    offsetY: anchor.y - worldY * scale,
  }
}

export function isInitialViewport(viewport: Viewport): boolean {
  return (
    viewport.scale === INITIAL_VIEWPORT.scale &&
    viewport.offsetX === INITIAL_VIEWPORT.offsetX &&
    viewport.offsetY === INITIAL_VIEWPORT.offsetY
  )
}

export function canvasTransform(viewport: Viewport): string {
  return `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`
}

export function formatZoom(viewport: Viewport): string {
  return `${Math.round(viewport.scale * 100)}%`
}
