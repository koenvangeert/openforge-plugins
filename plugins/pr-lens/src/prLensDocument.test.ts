import { describe, expect, it } from 'vitest'
import { render } from '@coldtea/pr-lens-renderer'
import { safeParseGraphDoc } from '@coldtea/pr-lens-schema'
import {
  danglingReferenceGraphDocInput,
  schemaInvalidGraphDocInput,
  validGraphDocInput,
} from './__fixtures__/graphDoc'

describe('pr-lens packages', () => {
  it('accepts the valid fixture and renders it to SVG', () => {
    const parsed = safeParseGraphDoc(validGraphDocInput())
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const rendered = render(parsed.value, { lens: 'architecture', theme: 'light' })
    expect(rendered.svg).toContain('<svg')
    expect(rendered.width).toBeGreaterThan(0)
  })

  it('rejects the schema-invalid fixture', () => {
    expect(safeParseGraphDoc(schemaInvalidGraphDocInput()).ok).toBe(false)
  })

  it('rejects an edge pointing at an undeclared node', () => {
    expect(safeParseGraphDoc(danglingReferenceGraphDocInput()).ok).toBe(false)
  })
})
