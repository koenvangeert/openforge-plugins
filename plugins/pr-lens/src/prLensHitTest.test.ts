import type { RenderAtlas } from '@coldtea/pr-lens-renderer'
import { describe, expect, it } from 'vitest'
import { validGraphDocInput } from './__fixtures__/graphDoc'
import { renderStoredDiagram } from './prLensDiagram'
import { hitTestDiagram } from './prLensHitTest'
import type { StoredDiagram } from './prLensStorage'

function drawnAtlas(): RenderAtlas {
  const result = renderStoredDiagram(
    { document: validGraphDocInput(), sessionId: 'S-1', storedAt: '', cleanliness: null } as unknown as StoredDiagram,
    { theme: 'light' },
  )
  if (!result.ok) throw new Error(result.message)
  return result.atlas
}

function centre(box: { x: number; y: number; width: number; height: number }) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

describe('hitTestDiagram', () => {
  it('finds the node a click landed in', () => {
    const atlas = drawnAtlas()

    expect(hitTestDiagram(atlas, centre(atlas.nodes.tab))).toEqual({ kind: 'node', id: 'tab' })
    expect(hitTestDiagram(atlas, centre(atlas.nodes.store))).toEqual({ kind: 'node', id: 'store' })
  })

  it('prefers a node over the lane drawn behind it', () => {
    const atlas = drawnAtlas()

    expect(hitTestDiagram(atlas, centre(atlas.nodes.tab))?.kind).toBe('node')
    expect(hitTestDiagram(atlas, { x: atlas.lanes.ui.x + 1, y: atlas.lanes.ui.y + 1 }))
      .toEqual({ kind: 'lane', id: 'ui' })
  })

  it('finds nothing outside every box', () => {
    const atlas = drawnAtlas()

    expect(hitTestDiagram(atlas, { x: -50, y: -50 })).toBeNull()
  })

  it('picks the tighter of two overlapping boxes of the same kind', () => {
    const atlas: RenderAtlas = {
      lanes: {},
      edges: {},
      messages: {},
      nodes: {
        wide: { x: 0, y: 0, width: 100, height: 100 },
        tight: { x: 40, y: 40, width: 20, height: 20 },
      },
    }

    expect(hitTestDiagram(atlas, { x: 50, y: 50 })).toEqual({ kind: 'node', id: 'tight' })
  })
})
