import { parseGraphDoc } from '@coldtea/pr-lens-schema'
import { describe, expect, it } from 'vitest'
import { validGraphDocInput, viewTreeGraphDocInput } from './__fixtures__/graphDoc'
import { viewChoices } from './prLensViews'

describe('viewChoices', () => {
  it('is empty for a document that declares no drill-down', () => {
    expect(viewChoices(parseGraphDoc(validGraphDocInput()))).toEqual([])
  })

  it('flattens the tree while keeping each view its depth', () => {
    expect(viewChoices(parseGraphDoc(viewTreeGraphDocInput()))).toEqual([
      { id: 'interface', title: 'Interface', lens: 'architecture', depth: 0 },
      { id: 'interface-tab', title: 'The tab itself', lens: 'architecture', depth: 1 },
    ])
  })
})
