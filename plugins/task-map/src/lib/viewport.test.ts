import { describe, expect, it } from 'vitest'
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
  type Viewport,
} from './viewport'

const origin: Viewport = { scale: 1, offsetX: 0, offsetY: 0 }

describe('panBy', () => {
  it('moves the offset and keeps the scale', () => {
    expect(panBy({ scale: 2, offsetX: 10, offsetY: -5 }, 4, 6)).toEqual({
      scale: 2,
      offsetX: 14,
      offsetY: 1,
    })
  })
})

describe('zoomAt', () => {
  it('keeps the anchored point under the anchor', () => {
    const anchor = { x: 300, y: 200 }
    const zoomed = zoomAt(origin, 2, anchor)

    const worldX = (anchor.x - zoomed.offsetX) / zoomed.scale
    const worldY = (anchor.y - zoomed.offsetY) / zoomed.scale
    expect([worldX, worldY]).toEqual([300, 200])
  })

  it('clamps in at the maximum zoom', () => {
    expect(zoomAt({ ...origin, scale: MAX_ZOOM / 1.1 }, 4, { x: 0, y: 0 }).scale).toBe(MAX_ZOOM)
  })

  it('clamps out at the minimum zoom', () => {
    expect(zoomAt({ ...origin, scale: MIN_ZOOM * 1.1 }, 0.1, { x: 0, y: 0 }).scale).toBe(MIN_ZOOM)
  })

  it('returns the same viewport when already clamped', () => {
    const atMaximum: Viewport = { scale: MAX_ZOOM, offsetX: 7, offsetY: 9 }

    expect(zoomAt(atMaximum, ZOOM_STEP, { x: 100, y: 100 })).toBe(atMaximum)
  })
})

describe('wheelZoomFactor', () => {
  it('zooms in on a negative delta', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1)
  })

  it('zooms out on a positive delta', () => {
    expect(wheelZoomFactor(100)).toBeLessThan(1)
  })

  it('is symmetric around zero', () => {
    expect(wheelZoomFactor(-120) * wheelZoomFactor(120)).toBeCloseTo(1)
  })
})

describe('isInitialViewport', () => {
  it('recognises an untouched viewport by value, not identity', () => {
    expect(isInitialViewport({ ...INITIAL_VIEWPORT })).toBe(true)
  })

  it('rejects a panned viewport', () => {
    expect(isInitialViewport(panBy(INITIAL_VIEWPORT, 1, 0))).toBe(false)
  })

  it('rejects a zoomed viewport', () => {
    expect(isInitialViewport(zoomAt(INITIAL_VIEWPORT, ZOOM_STEP, { x: 0, y: 0 }))).toBe(false)
  })
})

describe('canvasTransform', () => {
  it('renders the offset before the scale', () => {
    expect(canvasTransform({ scale: 1.5, offsetX: 12, offsetY: -3 })).toBe(
      'translate(12px, -3px) scale(1.5)',
    )
  })
})

describe('formatZoom', () => {
  it('reads the initial viewport as 100%', () => {
    expect(formatZoom(INITIAL_VIEWPORT)).toBe('100%')
  })

  it('rounds to whole percent', () => {
    expect(formatZoom({ ...origin, scale: 1.234 })).toBe('123%')
  })
})
