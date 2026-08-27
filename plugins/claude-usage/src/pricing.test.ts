import { describe, expect, it } from 'vitest'
import { costOf, isPricedModel, normalizeModelId, PRICE_TABLE, totalCost } from './pricing'

const OPUS_TOKENS = {
  input: 1_000_000,
  output: 1_000_000,
  cacheWrite5m: 1_000_000,
  cacheWrite1h: 1_000_000,
  cacheRead: 1_000_000,
}

describe('normalizeModelId', () => {
  it('collapses the 1M context suffix onto the base model', () => {
    expect(normalizeModelId('claude-opus-5[1m]')).toBe('claude-opus-5')
  })

  it('collapses a dated model id onto its undated price table key', () => {
    expect(normalizeModelId('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5')
  })

  it('leaves an unknown model id intact', () => {
    expect(normalizeModelId('claude-unreleased-9')).toBe('claude-unreleased-9')
  })
})

describe('costOf', () => {
  it('prices each token class at its own Opus rate', () => {
    expect(costOf('claude-opus-5', OPUS_TOKENS)).toEqual({
      input: 5,
      output: 25,
      cacheWrite: 16.25,
      cacheRead: 0.5,
    })
  })

  it('prices the 1M context variant identically to the base model', () => {
    expect(costOf('claude-opus-5[1m]', OPUS_TOKENS)).toEqual(costOf('claude-opus-5', OPUS_TOKENS))
  })

  it('reproduces a cost Claude Code recorded for itself', () => {
    const cost = costOf('claude-opus-5[1m]', {
      input: 276,
      output: 20_161,
      cacheWrite5m: 150_280,
      cacheWrite1h: 0,
      cacheRead: 3_058_924,
    })

    expect(totalCost(cost!)).toBeCloseTo(2.974117, 6)
  })

  it('returns null for an unpriced model rather than zero', () => {
    expect(costOf('<synthetic>', OPUS_TOKENS)).toBeNull()
    expect(isPricedModel('<synthetic>')).toBe(false)
  })
})

describe('PRICE_TABLE', () => {
  it('charges more to write a one-hour cache entry than a five-minute one', () => {
    for (const price of Object.values(PRICE_TABLE)) {
      expect(price.cacheWrite1h).toBeGreaterThan(price.cacheWrite5m)
      expect(price.cacheRead).toBeLessThan(price.input)
    }
  })
})
