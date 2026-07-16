import { describe, expect, it } from 'vitest'
import { normalizeCredentials, normalizeSite } from './credentials'

describe('normalizeSite', () => {
  it('adds https and strips path/trailing slash', () => {
    expect(normalizeSite('acme.atlassian.net')).toBe('https://acme.atlassian.net')
    expect(normalizeSite('https://acme.atlassian.net/')).toBe('https://acme.atlassian.net')
    expect(normalizeSite('https://acme.atlassian.net/jira/software')).toBe('https://acme.atlassian.net')
  })

  it('forces https even when http is supplied (Basic auth must not go in the clear)', () => {
    expect(normalizeSite('http://acme.atlassian.net')).toBe('https://acme.atlassian.net')
  })

  it('returns null for blank input', () => {
    expect(normalizeSite('   ')).toBeNull()
    expect(normalizeSite('https://')).toBeNull()
  })
})

describe('normalizeCredentials', () => {
  it('normalizes a complete credential set', () => {
    expect(
      normalizeCredentials({ site: 'acme.atlassian.net/', email: '  me@acme.com ', apiToken: ' tok ' }),
    ).toEqual({ site: 'https://acme.atlassian.net', email: 'me@acme.com', apiToken: 'tok' })
  })

  it('returns null when any field is missing or blank', () => {
    expect(normalizeCredentials(null)).toBeNull()
    expect(normalizeCredentials({ site: 'acme.atlassian.net', email: 'me@acme.com' })).toBeNull()
    expect(normalizeCredentials({ site: 'acme.atlassian.net', email: '', apiToken: 'tok' })).toBeNull()
    expect(normalizeCredentials({ site: '', email: 'me@acme.com', apiToken: 'tok' })).toBeNull()
  })
})
