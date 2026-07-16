import { describe, expect, it } from 'vitest'
import { extractIssueKeyHint, isValidIssueKey, validateJql } from './issueKey'

describe('isValidIssueKey', () => {
  it('accepts a well-formed key', () => {
    expect(isValidIssueKey('PROJ-123')).toBe(true)
    expect(isValidIssueKey('AB1-9')).toBe(true)
  })

  it('rejects malformed keys', () => {
    expect(isValidIssueKey('proj-123')).toBe(false)
    expect(isValidIssueKey('PROJ')).toBe(false)
    expect(isValidIssueKey('123')).toBe(false)
    expect(isValidIssueKey('PROJ-')).toBe(false)
    expect(isValidIssueKey('')).toBe(false)
  })
})

describe('extractIssueKeyHint', () => {
  it('finds the first key across the given fragments', () => {
    expect(extractIssueKeyHint('Implement the thing for PROJ-42 today')).toBe('PROJ-42')
    expect(extractIssueKeyHint(null, undefined, 'see ABC-7 and DEF-9')).toBe('ABC-7')
  })

  it('scans initial_prompt before summary', () => {
    expect(extractIssueKeyHint('no key here', 'linked to KVG-1219')).toBe('KVG-1219')
  })

  it('returns null when nothing key-shaped is present', () => {
    expect(extractIssueKeyHint('just some prose', null)).toBeNull()
    expect(extractIssueKeyHint()).toBeNull()
  })

  it('treats a task-id-looking string as a hint only (non-authoritative)', () => {
    // The hint may coincide with an OpenForge Task id; the caller confirms it.
    expect(extractIssueKeyHint('KVG-1444')).toBe('KVG-1444')
  })
})

describe('validateJql', () => {
  it('accepts and trims a non-empty query', () => {
    expect(validateJql('  project = KVG  ')).toEqual({ ok: true, jql: 'project = KVG' })
  })

  it('rejects an empty or whitespace-only query', () => {
    expect(validateJql('')).toMatchObject({ ok: false })
    expect(validateJql('   ')).toMatchObject({ ok: false })
  })
})
