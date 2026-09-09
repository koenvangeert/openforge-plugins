import type { GraphDoc } from '@coldtea/pr-lens-schema'
import { describe, expect, it } from 'vitest'
import {
  twoLensGraphDocInput,
  undrawableGraphDocInput,
  validGraphDocInput,
  viewTreeGraphDocInput,
} from './__fixtures__/graphDoc'
import { renderStoredDiagram } from './prLensDiagram'
import type { StoredDiagram } from './prLensStorage'

function stored(document: unknown): StoredDiagram {
  return {
    document: document as GraphDoc,
    sessionId: 'S-1',
    storedAt: '2026-09-08T10:00:00.000Z',
    cleanliness: 'clean',
  }
}

describe('renderStoredDiagram', () => {
  it('draws a stored document as SVG', () => {
    const result = renderStoredDiagram(stored(validGraphDocInput()), { theme: 'light' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.svg).toContain('<svg')
    expect(result.lens).toBe('architecture')
  })

  it('draws light and dark differently', () => {
    const light = renderStoredDiagram(stored(validGraphDocInput()), { theme: 'light' })
    const dark = renderStoredDiagram(stored(validGraphDocInput()), { theme: 'dark' })

    expect(light.ok && dark.ok).toBe(true)
    if (!light.ok || !dark.ok) return
    expect(light.svg).not.toBe(dark.svg)
  })

  it('honours a requested lens the document declares', () => {
    const doc = stored(twoLensGraphDocInput())

    const architecture = renderStoredDiagram(doc, { lens: 'architecture', theme: 'light' })
    const dataFlow = renderStoredDiagram(doc, { lens: 'data-flow', theme: 'light' })

    expect(architecture.ok && dataFlow.ok).toBe(true)
    if (!architecture.ok || !dataFlow.ok) return
    expect(dataFlow.lens).toBe('data-flow')
    expect(dataFlow.svg).not.toBe(architecture.svg)
  })

  it('falls back to the first declared lens when the requested one is absent', () => {
    const result = renderStoredDiagram(stored(validGraphDocInput()), {
      lens: 'data-flow',
      theme: 'light',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.lens).toBe('architecture')
  })

  it('reports a stored document that no longer validates instead of drawing it', () => {
    const invalid = validGraphDocInput()
    delete invalid.provenance

    const result = renderStoredDiagram(stored(invalid), { theme: 'light' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('PR Lens document format')
    expect(result.message).toContain('provenance')
  })

  it('reports a render failure by its renderer code and keeps the document', () => {
    const diagram = stored(undrawableGraphDocInput())

    const result = renderStoredDiagram(diagram, { theme: 'light' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('NO_FLOW_IN_SCOPE')
    expect(diagram.document).toEqual(undrawableGraphDocInput())
  })

  it('carries the geometry a surface needs to zoom and hit-test', () => {
    const result = renderStoredDiagram(stored(validGraphDocInput()), { theme: 'light' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)
    expect(Object.keys(result.atlas.nodes)).toEqual(['tab', 'store'])
    expect(result.atlas.edges.e1).toBeTruthy()
    expect(result.svg).toContain(`viewBox="0 0 ${result.width} ${result.height}"`)
  })

  it('draws only a requested drill-down view', () => {
    const diagram = stored(viewTreeGraphDocInput())

    const whole = renderStoredDiagram(diagram, { theme: 'light' })
    const scoped = renderStoredDiagram(diagram, { theme: 'light', view: 'interface-tab' })

    expect(whole.ok && scoped.ok).toBe(true)
    if (!whole.ok || !scoped.ok) return
    expect(scoped.view).toBe('interface-tab')
    expect(Object.keys(scoped.atlas.nodes)).toEqual(['tab'])
    expect(Object.keys(whole.atlas.nodes)).toEqual(['tab', 'store'])
  })

  it('falls back to the whole document when the requested view is gone', () => {
    const result = renderStoredDiagram(stored(viewTreeGraphDocInput()), {
      theme: 'light',
      view: 'removed',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.view).toBeNull()
  })
})
