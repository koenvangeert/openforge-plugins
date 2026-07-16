import { describe, expect, it } from 'vitest'
import { buildCredentialsToStore } from './settingsForm'

describe('buildCredentialsToStore', () => {
  it('normalizes and stores a fully typed credential set', () => {
    const result = buildCredentialsToStore({ site: 'acme.atlassian.net', email: ' me@acme.com ', apiToken: ' tok ' }, null)
    expect(result).toEqual({ ok: true, credentials: { site: 'https://acme.atlassian.net', email: 'me@acme.com', apiToken: 'tok' } })
  })

  it('keeps the existing token when the field is left blank', () => {
    const result = buildCredentialsToStore({ site: 'acme.atlassian.net', email: 'me@acme.com', apiToken: '   ' }, 'stored-token')
    expect(result).toMatchObject({ ok: true, credentials: { apiToken: 'stored-token' } })
  })

  it('prefers a newly typed token over the existing one', () => {
    const result = buildCredentialsToStore({ site: 'acme.atlassian.net', email: 'me@acme.com', apiToken: 'new-token' }, 'stored-token')
    expect(result).toMatchObject({ ok: true, credentials: { apiToken: 'new-token' } })
  })

  it('errors when blank and no token is stored yet', () => {
    const result = buildCredentialsToStore({ site: 'acme.atlassian.net', email: 'me@acme.com', apiToken: '' }, null)
    expect(result).toMatchObject({ ok: false })
  })

  it('errors on an invalid site', () => {
    expect(buildCredentialsToStore({ site: '   ', email: 'me@acme.com', apiToken: 'tok' }, null)).toMatchObject({ ok: false })
  })

  it('errors on a blank email', () => {
    expect(buildCredentialsToStore({ site: 'acme.atlassian.net', email: '  ', apiToken: 'tok' }, null)).toMatchObject({ ok: false })
  })
})
