export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4
export const ZOOM_STEP = 0.25

export type ZoomState = { mode: 'fit' } | { mode: 'manual'; scale: number }

export const FIT_ZOOM: ZoomState = { mode: 'fit' }

export interface Size {
  width: number
  height: number
}

function clamp(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale))
}

export function fitScale(content: Size, viewport: Size): number | null {
  if (content.width <= 0 || content.height <= 0) return null
  if (viewport.width <= 0 || viewport.height <= 0) return null
  return clamp(Math.min(viewport.width / content.width, viewport.height / content.height))
}

export function resolveScale(state: ZoomState, fit: number | null): number {
  if (state.mode === 'manual') return clamp(state.scale)
  return fit ?? 1
}

export function manualZoom(scale: number): ZoomState {
  return { mode: 'manual', scale: clamp(scale) }
}

export function zoomIn(state: ZoomState, fit: number | null): ZoomState {
  return manualZoom(stepUp(resolveScale(state, fit)))
}

export function zoomOut(state: ZoomState, fit: number | null): ZoomState {
  return manualZoom(stepDown(resolveScale(state, fit)))
}

export function canZoomIn(state: ZoomState, fit: number | null): boolean {
  return resolveScale(state, fit) < MAX_ZOOM
}

export function canZoomOut(state: ZoomState, fit: number | null): boolean {
  return resolveScale(state, fit) > MIN_ZOOM
}

export function zoomLabel(state: ZoomState, fit: number | null): string {
  return `${Math.round(resolveScale(state, fit) * 100)}%`
}

export interface Point {
  x: number
  y: number
}

export interface Framing {
  zoom: ZoomState
  pan: Point
}

export const ORIGIN: Point = { x: 0, y: 0 }

export function contentOffset(
  content: Size,
  viewport: Size,
  scale: number,
  pan: Point,
): Point {
  return {
    x: Math.max(0, (viewport.width - content.width * scale) / 2) + pan.x,
    y: Math.max(0, (viewport.height - content.height * scale) / 2) + pan.y,
  }
}

export interface RescaleContext {
  content: Size
  viewport: Size
  scale: number
  pan: Point
}

export function rescaleAround(target: number, anchor: Point, at: RescaleContext): Framing {
  const scale = clamp(target)
  const before = contentOffset(at.content, at.viewport, at.scale, at.pan)
  const held = { x: (anchor.x - before.x) / at.scale, y: (anchor.y - before.y) / at.scale }
  const centred = contentOffset(at.content, at.viewport, scale, ORIGIN)
  return {
    zoom: manualZoom(scale),
    pan: { x: anchor.x - held.x * scale - centred.x, y: anchor.y - held.y * scale - centred.y },
  }
}

const WHEEL_SENSITIVITY = 0.002
const WHEEL_DELTA_LIMIT = 120

export function wheelScale(current: number, deltaY: number): number {
  const delta = Math.max(-WHEEL_DELTA_LIMIT, Math.min(WHEEL_DELTA_LIMIT, deltaY))
  return clamp(current * Math.exp(-delta * WHEEL_SENSITIVITY))
}

export function stepUp(scale: number): number {
  return clamp(Math.ceil((scale + 1e-6) / ZOOM_STEP) * ZOOM_STEP)
}

export function stepDown(scale: number): number {
  return clamp(Math.floor((scale - 1e-6) / ZOOM_STEP) * ZOOM_STEP)
}
