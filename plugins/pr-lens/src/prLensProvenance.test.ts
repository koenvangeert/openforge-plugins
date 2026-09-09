import { describe, expect, it } from 'vitest'
import { HEAD_SHA, validGraphDocInput } from './__fixtures__/graphDoc'
import { diagramFreshness, diagramProvenance } from './prLensProvenance'
import type { StoredDiagram } from './prLensStorage'

function diagram(overrides: Partial<StoredDiagram> = {}): StoredDiagram {
  return {
    document: validGraphDocInput() as StoredDiagram['document'],
    sessionId: 'S-1',
    storedAt: '2026-09-09T08:00:00.000Z',
    cleanliness: 'clean',
    ...overrides,
  }
}

describe('diagramFreshness', () => {
  it('is fresh while the producing session is still the current one', () => {
    expect(diagramFreshness(diagram(), 'S-1')).toBe('fresh')
  })

  it('is stale once a newer session has run', () => {
    expect(diagramFreshness(diagram(), 'S-2')).toBe('stale')
  })

  it('is stale when the task has no current session', () => {
    expect(diagramFreshness(diagram(), null)).toBe('stale')
  })

  it('is stale when the producing session was never recorded', () => {
    expect(diagramFreshness(diagram({ sessionId: null }), 'S-1')).toBe('stale')
  })
})

describe('diagramProvenance', () => {
  it('reads the repository and head commit off the document', () => {
    const provenance = diagramProvenance(diagram(), 'S-1')

    expect(provenance.repo).toBe('acme/app')
    expect(provenance.headSha).toBe(HEAD_SHA)
    expect(provenance.headShortSha).toBe(HEAD_SHA.slice(0, 7))
    expect(provenance.headRef).toBe('add-pr-lens')
  })

  it('reports uncommitted work the Agent flagged', () => {
    expect(diagramProvenance(diagram({ cleanliness: 'dirty' }), 'S-1').cleanliness).toBe('dirty')
  })

  it('reports unrecorded cleanliness as unknown rather than clean', () => {
    expect(diagramProvenance(diagram({ cleanliness: null }), 'S-1').cleanliness).toBe('unknown')
  })
})
