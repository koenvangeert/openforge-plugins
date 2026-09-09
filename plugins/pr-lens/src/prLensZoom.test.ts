import { describe, expect, it } from 'vitest'
import {
  canZoomIn,
  canZoomOut,
  contentOffset,
  FIT_ZOOM,
  fitScale,
  manualZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  ORIGIN,
  rescaleAround,
  resolveScale,
  wheelScale,
  zoomIn,
  zoomLabel,
  zoomOut,
} from './prLensZoom'

describe('fitScale', () => {
  it('shrinks a wide diagram to the narrower axis', () => {
    expect(fitScale({ width: 2000, height: 500 }, { width: 1000, height: 500 })).toBe(0.5)
  })

  it('never exceeds the zoom bounds', () => {
    expect(fitScale({ width: 10, height: 10 }, { width: 1000, height: 1000 })).toBe(MAX_ZOOM)
    expect(fitScale({ width: 100000, height: 10 }, { width: 100, height: 100 })).toBe(MIN_ZOOM)
  })

  it('is unknown before the viewport or the diagram has a size', () => {
    expect(fitScale({ width: 0, height: 0 }, { width: 100, height: 100 })).toBeNull()
    expect(fitScale({ width: 100, height: 100 }, { width: 0, height: 0 })).toBeNull()
  })
})

describe('zoom state', () => {
  it('reports the fit scale until the user takes over', () => {
    expect(resolveScale(FIT_ZOOM, 0.4)).toBe(0.4)
    expect(zoomLabel(FIT_ZOOM, 0.4)).toBe('40%')
  })

  it('assumes full size when nothing has been measured yet', () => {
    expect(resolveScale(FIT_ZOOM, null)).toBe(1)
  })

  it('steps up and down from the fit scale onto the step grid', () => {
    expect(zoomIn(FIT_ZOOM, 0.4)).toEqual({ mode: 'manual', scale: 0.5 })
    expect(zoomOut(FIT_ZOOM, 0.4)).toEqual({ mode: 'manual', scale: 0.25 })
  })

  it('moves one whole step from a scale already on the grid', () => {
    expect(zoomIn(manualZoom(1), null)).toEqual({ mode: 'manual', scale: 1.25 })
    expect(zoomOut(manualZoom(1), null)).toEqual({ mode: 'manual', scale: 0.75 })
  })

  it('stops at the bounds', () => {
    expect(resolveScale(zoomIn(manualZoom(MAX_ZOOM), null), null)).toBe(MAX_ZOOM)
    expect(resolveScale(zoomOut(manualZoom(MIN_ZOOM), null), null)).toBe(MIN_ZOOM)
    expect(canZoomIn(manualZoom(MAX_ZOOM), null)).toBe(false)
    expect(canZoomOut(manualZoom(MIN_ZOOM), null)).toBe(false)
    expect(canZoomIn(FIT_ZOOM, 0.4)).toBe(true)
    expect(canZoomOut(FIT_ZOOM, 0.4)).toBe(true)
  })
})

describe('rescaleAround', () => {
  const content = { width: 1000, height: 1000 }
  const viewport = { width: 400, height: 400 }

  function pointUnder(anchor: { x: number; y: number }, scale: number, pan: { x: number; y: number }) {
    const offset = contentOffset(content, viewport, scale, pan)
    return { x: (anchor.x - offset.x) / scale, y: (anchor.y - offset.y) / scale }
  }

  it('holds the anchored point of the diagram still', () => {
    const anchor = { x: 320, y: 90 }
    const before = pointUnder(anchor, 0.4, ORIGIN)

    const framing = rescaleAround(1.6, anchor, { content, viewport, scale: 0.4, pan: ORIGIN })

    expect(pointUnder(anchor, resolveScale(framing.zoom, null), framing.pan).x).toBeCloseTo(before.x)
    expect(pointUnder(anchor, resolveScale(framing.zoom, null), framing.pan).y).toBeCloseTo(before.y)
  })

  it('holds it across a chain of small steps, as a trackpad produces', () => {
    const anchor = { x: 120, y: 300 }
    const before = pointUnder(anchor, 0.4, ORIGIN)
    let framing = { zoom: manualZoom(0.4), pan: ORIGIN }

    for (let step = 0; step < 40; step += 1) {
      const scale = resolveScale(framing.zoom, null)
      framing = rescaleAround(wheelScale(scale, -4), anchor, { content, viewport, scale, pan: framing.pan })
    }

    const scale = resolveScale(framing.zoom, null)
    expect(scale).toBeGreaterThan(0.4)
    expect(pointUnder(anchor, scale, framing.pan).x).toBeCloseTo(before.x)
    expect(pointUnder(anchor, scale, framing.pan).y).toBeCloseTo(before.y)
  })

  it('stays within the zoom bounds', () => {
    const anchor = { x: 200, y: 200 }
    const at = { content, viewport, scale: 1, pan: ORIGIN }

    expect(resolveScale(rescaleAround(99, anchor, at).zoom, null)).toBe(MAX_ZOOM)
    expect(resolveScale(rescaleAround(0.001, anchor, at).zoom, null)).toBe(MIN_ZOOM)
  })
})

describe('wheelScale', () => {
  it('zooms in on a scroll up and out on a scroll down', () => {
    expect(wheelScale(1, -100)).toBeGreaterThan(1)
    expect(wheelScale(1, 100)).toBeLessThan(1)
  })

  it('moves a trackpad nudge far less than a mouse notch', () => {
    expect(wheelScale(1, -4) - 1).toBeLessThan((wheelScale(1, -100) - 1) / 10)
  })

  it('caps a single runaway delta', () => {
    expect(wheelScale(1, -4000)).toBe(wheelScale(1, -120))
  })
})
