import { addTokens, type TokenTotals } from './pricing'
import type { BilledResponse } from './transcript'

export interface IndexedTranscript {
  sizeBytes: number
  modifiedAt: number | null
  /** Keyed by `${cwd}\n${utcHour}\n${model}`. */
  rows: Map<string, TokenTotals>
}

export interface SpendIndex {
  /** Keyed by transcript path relative to the Claude Code projects root. */
  transcripts: Map<string, IndexedTranscript>
}

export interface SpendIndexRow {
  cwd: string
  /** `YYYY-MM-DDTHH`, always UTC. */
  utcHour: string
  model: string
  tokens: TokenTotals
}

const SEPARATOR = '\n'
const SERIALIZED_VERSION = 1

export function emptySpendIndex(): SpendIndex {
  return { transcripts: new Map() }
}

export function utcHourOf(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 13)
}

export function rowKey(cwd: string, utcHour: string, model: string): string {
  return `${cwd}${SEPARATOR}${utcHour}${SEPARATOR}${model}`
}

function parseRowKey(key: string): { cwd: string; utcHour: string; model: string } | null {
  const parts = key.split(SEPARATOR)
  if (parts.length !== 3) return null
  return { cwd: parts[0]!, utcHour: parts[1]!, model: parts[2]! }
}

export function indexTranscript(
  responses: Iterable<BilledResponse>,
  stat: { sizeBytes: number; modifiedAt: number | null },
): IndexedTranscript {
  const rows = new Map<string, TokenTotals>()
  for (const response of responses) {
    const key = rowKey(response.cwd, utcHourOf(response.timestamp), response.model)
    const existing = rows.get(key)
    rows.set(key, existing ? addTokens(existing, response.tokens) : response.tokens)
  }
  return { sizeBytes: stat.sizeBytes, modifiedAt: stat.modifiedAt, rows }
}

/**
 * Replaces one transcript's contribution and leaves every other entry intact.
 * Claude Code prunes its own transcripts after about a month, so an entry whose
 * file is gone is the only surviving record of that period and is never dropped.
 */
export function mergeTranscript(index: SpendIndex, path: string, transcript: IndexedTranscript): void {
  index.transcripts.set(path, transcript)
}

export function needsRescan(
  index: SpendIndex,
  path: string,
  stat: { sizeBytes: number; modifiedAt: number | null },
): boolean {
  const indexed = index.transcripts.get(path)
  if (!indexed) return true
  return indexed.sizeBytes !== stat.sizeBytes || indexed.modifiedAt !== stat.modifiedAt
}

export function* iterateRows(index: SpendIndex): Generator<SpendIndexRow> {
  for (const transcript of index.transcripts.values()) {
    for (const [key, tokens] of transcript.rows) {
      const parsed = parseRowKey(key)
      if (parsed) yield { ...parsed, tokens }
    }
  }
}

interface SerializedIndex {
  version: number
  transcripts: Record<string, SerializedTranscript>
}

interface SerializedTranscript {
  size: number
  mtime: number | null
  /** `[input, output, cacheWrite5m, cacheWrite1h, cacheRead]`, halving the file. */
  rows: Record<string, [number, number, number, number, number]>
}

export function serializeSpendIndex(index: SpendIndex): string {
  const transcripts: Record<string, SerializedTranscript> = {}
  for (const [path, transcript] of index.transcripts) {
    const rows: SerializedTranscript['rows'] = {}
    for (const [key, t] of transcript.rows) {
      rows[key] = [t.input, t.output, t.cacheWrite5m, t.cacheWrite1h, t.cacheRead]
    }
    transcripts[path] = { size: transcript.sizeBytes, mtime: transcript.modifiedAt, rows }
  }
  return JSON.stringify({ version: SERIALIZED_VERSION, transcripts } satisfies SerializedIndex)
}

/** Any unreadable or future-version payload yields an empty index to rebuild into. */
export function parseSpendIndex(payload: string): SpendIndex {
  let parsed: SerializedIndex
  try {
    parsed = JSON.parse(payload) as SerializedIndex
  } catch {
    return emptySpendIndex()
  }
  if (parsed?.version !== SERIALIZED_VERSION || typeof parsed.transcripts !== 'object') {
    return emptySpendIndex()
  }
  const index = emptySpendIndex()
  for (const [path, transcript] of Object.entries(parsed.transcripts)) {
    if (!transcript || typeof transcript.rows !== 'object') continue
    const rows = new Map<string, TokenTotals>()
    for (const [key, values] of Object.entries(transcript.rows)) {
      if (!Array.isArray(values) || values.length !== 5) continue
      rows.set(key, {
        input: values[0]!,
        output: values[1]!,
        cacheWrite5m: values[2]!,
        cacheWrite1h: values[3]!,
        cacheRead: values[4]!,
      })
    }
    index.transcripts.set(path, {
      sizeBytes: typeof transcript.size === 'number' ? transcript.size : 0,
      modifiedAt: typeof transcript.mtime === 'number' ? transcript.mtime : null,
      rows,
    })
  }
  return index
}
