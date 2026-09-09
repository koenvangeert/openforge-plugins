import { parseGraphDoc } from '@coldtea/pr-lens-schema'
import { describe, expect, it } from 'vitest'
import { detailedGraphDocInput, validGraphDocInput } from './__fixtures__/graphDoc'
import { diagramDetail } from './prLensDetails'

describe('diagramDetail', () => {
  it('describes a node with everything the agent said about it', () => {
    const doc = parseGraphDoc(detailedGraphDocInput())

    expect(diagramDetail(doc, { kind: 'node', id: 'tab' })).toEqual({
      kind: 'node',
      title: 'PR Lens tab',
      subtitle: 'PrLensTaskPane.svelte',
      context: 'Interface',
      badges: ['ui', 'new'],
      delta: 'added',
      summary: 'Draws the stored document and offers the request control.',
      files: ['src/PrLensTaskPane.svelte:1-40'],
    })
  })

  it('names both ends of an edge', () => {
    const doc = parseGraphDoc(detailedGraphDocInput())

    expect(diagramDetail(doc, { kind: 'edge', id: 'e1' })).toMatchObject({
      kind: 'edge',
      context: 'PR Lens tab to Task storage',
      summary: 'Reads the task-scoped document.',
    })
  })

  it("counts a lane's members", () => {
    const doc = parseGraphDoc(detailedGraphDocInput())

    expect(diagramDetail(doc, { kind: 'lane', id: 'ui' })).toMatchObject({
      kind: 'lane',
      title: 'Interface',
      context: '2 nodes',
    })
  })

  it('leaves the optional prose empty when the agent said nothing', () => {
    const doc = parseGraphDoc(validGraphDocInput())

    expect(diagramDetail(doc, { kind: 'node', id: 'tab' })).toMatchObject({
      subtitle: null,
      summary: null,
      files: [],
    })
  })

  it('has nothing to say about an id the document does not declare', () => {
    const doc = parseGraphDoc(validGraphDocInput())

    expect(diagramDetail(doc, { kind: 'node', id: 'absent' })).toBeNull()
  })
})
