export const RESCAN_MINUTES_KEY = 'rescanMinutes'
export const DEFAULT_RESCAN_MINUTES = 5
export const MIN_RESCAN_MINUTES = 1
export const MAX_RESCAN_MINUTES = 240

export interface RescanIntervalStore {
  get(key: string): Promise<unknown>
  set(key: string, value: number): Promise<void>
}

function readNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return Number.NaN
}

export function clampRescanMinutes(value: unknown): number {
  const minutes = readNumber(value)
  if (!Number.isFinite(minutes)) return DEFAULT_RESCAN_MINUTES
  return Math.min(MAX_RESCAN_MINUTES, Math.max(MIN_RESCAN_MINUTES, Math.round(minutes)))
}

export async function readRescanMinutes(store: RescanIntervalStore): Promise<number> {
  try {
    const stored = await store.get(RESCAN_MINUTES_KEY)
    return stored === null || stored === undefined ? DEFAULT_RESCAN_MINUTES : clampRescanMinutes(stored)
  } catch {
    return DEFAULT_RESCAN_MINUTES
  }
}

export async function writeRescanMinutes(store: RescanIntervalStore, minutes: number): Promise<number> {
  const clamped = clampRescanMinutes(minutes)
  await store.set(RESCAN_MINUTES_KEY, clamped)
  return clamped
}
