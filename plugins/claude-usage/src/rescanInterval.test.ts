import { describe, expect, it, vi } from 'vitest'
import {
  clampRescanMinutes,
  DEFAULT_RESCAN_MINUTES,
  MAX_RESCAN_MINUTES,
  MIN_RESCAN_MINUTES,
  readRescanMinutes,
  RESCAN_MINUTES_KEY,
  writeRescanMinutes,
} from './rescanInterval'

function store(initial: unknown = null) {
  const values = new Map<string, unknown>([[RESCAN_MINUTES_KEY, initial]])
  return {
    values,
    get: vi.fn(async (key: string) => (values.get(key) ?? null) as never),
    set: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value)
    }),
  }
}

describe('clampRescanMinutes', () => {
  it('keeps a scan from running more often than once a minute', () => {
    expect(clampRescanMinutes(0)).toBe(MIN_RESCAN_MINUTES)
    expect(clampRescanMinutes(-30)).toBe(MIN_RESCAN_MINUTES)
  })

  it('caps the interval so the index cannot silently go a day stale', () => {
    expect(clampRescanMinutes(10_000)).toBe(MAX_RESCAN_MINUTES)
  })

  it('rounds to whole minutes, because the input is a minute field', () => {
    expect(clampRescanMinutes(7.4)).toBe(7)
  })

  it('falls back to the default for anything that is not a number', () => {
    expect(clampRescanMinutes('nonsense')).toBe(DEFAULT_RESCAN_MINUTES)
    expect(clampRescanMinutes(null)).toBe(DEFAULT_RESCAN_MINUTES)
    expect(clampRescanMinutes(Number.NaN)).toBe(DEFAULT_RESCAN_MINUTES)
  })
})

describe('readRescanMinutes', () => {
  it('defaults when nothing has been configured', async () => {
    await expect(readRescanMinutes(store())).resolves.toBe(DEFAULT_RESCAN_MINUTES)
  })

  it('clamps a stored value that is out of range', async () => {
    await expect(readRescanMinutes(store(0))).resolves.toBe(MIN_RESCAN_MINUTES)
  })

  it('defaults rather than throwing when storage is unreachable', async () => {
    const failing = { get: vi.fn(async () => { throw new Error('no storage') }), set: vi.fn() }

    await expect(readRescanMinutes(failing)).resolves.toBe(DEFAULT_RESCAN_MINUTES)
  })
})

describe('writeRescanMinutes', () => {
  it('persists the clamped value and reports what was stored', async () => {
    const target = store()

    await expect(writeRescanMinutes(target, 0)).resolves.toBe(MIN_RESCAN_MINUTES)
    expect(target.values.get(RESCAN_MINUTES_KEY)).toBe(MIN_RESCAN_MINUTES)
  })
})
