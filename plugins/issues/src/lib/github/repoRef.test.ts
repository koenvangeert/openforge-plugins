import { describe, expect, it, vi } from 'vitest'
import { parseOwnerName, resolveRepoRef } from './repoRef'

const ACME = { owner: 'acme', name: 'repo' }

describe('parseOwnerName', () => {
  it('accepts bare hints, https, scp-style and ssh remotes', () => {
    expect(parseOwnerName('acme/repo')).toEqual(ACME)
    expect(parseOwnerName('acme/repo/')).toEqual(ACME)
    expect(parseOwnerName('https://github.com/acme/repo')).toEqual(ACME)
    expect(parseOwnerName('https://github.com/acme/repo.git')).toEqual(ACME)
    expect(parseOwnerName('git@github.com:acme/repo.git')).toEqual(ACME)
    expect(parseOwnerName('ssh://git@github.com/acme/repo.git')).toEqual(ACME)
  })

  it('takes the first two segments when the url carries extra path', () => {
    expect(parseOwnerName('https://github.com/acme/repo/extra/path')).toEqual(ACME)
  })

  it('rejects inputs that carry no owner/name pair', () => {
    expect(parseOwnerName('')).toBeNull()
    expect(parseOwnerName('   ')).toBeNull()
    expect(parseOwnerName('acme')).toBeNull()
    expect(parseOwnerName('https://github.com/acme')).toBeNull()
  })
})

function fakeApi(options: { hint?: string | null; path?: string | null }) {
  return {
    projectConfig: {
      get: vi.fn(async () => (options.hint ?? null) as never),
      set: vi.fn(),
    },
    projects: {
      list: vi.fn(),
      get: vi.fn(async () =>
        options.path === undefined ? null : ({ id: 'P-1', name: 'acme', path: options.path, created_at: 0, updated_at: 0 } as never),
      ),
    },
  }
}

describe('resolveRepoRef', () => {
  it('prefers the project-config repo hint over the git remote', async () => {
    const api = fakeApi({ hint: 'acme/repo', path: '/tmp/project' })
    const readOriginUrl = vi.fn()

    expect(await resolveRepoRef(api as never, 'P-1', readOriginUrl)).toEqual(ACME)
    expect(readOriginUrl).not.toHaveBeenCalled()
  })

  it('falls back to the origin remote when the hint is absent', async () => {
    const api = fakeApi({ hint: null, path: '/tmp/project' })
    const readOriginUrl = vi.fn(async () => 'git@github.com:acme/repo.git')

    expect(await resolveRepoRef(api as never, 'P-1', readOriginUrl)).toEqual(ACME)
    expect(readOriginUrl).toHaveBeenCalledWith('/tmp/project')
  })

  it('falls back to the origin remote when the hint is unparseable', async () => {
    const api = fakeApi({ hint: 'not-a-repo', path: '/tmp/project' })
    const readOriginUrl = vi.fn(async () => 'https://github.com/acme/repo')

    expect(await resolveRepoRef(api as never, 'P-1', readOriginUrl)).toEqual(ACME)
  })

  it('reports the missing project rather than probing git', async () => {
    const api = fakeApi({ hint: null, path: undefined })
    const readOriginUrl = vi.fn()

    await expect(resolveRepoRef(api as never, 'P-1', readOriginUrl)).rejects.toThrow('project P-1 not found')
    expect(readOriginUrl).not.toHaveBeenCalled()
  })

  it('explains how to fix a project with no GitHub remote', async () => {
    const api = fakeApi({ hint: null, path: '/tmp/project' })
    const readOriginUrl = vi.fn(async () => null)

    await expect(resolveRepoRef(api as never, 'P-1', readOriginUrl)).rejects.toThrow(
      /no GitHub repository configured for project P-1/,
    )
  })

  it('reports a remote that carries no owner/name pair', async () => {
    const api = fakeApi({ hint: null, path: '/tmp/project' })
    const readOriginUrl = vi.fn(async () => 'bare-repo')

    await expect(resolveRepoRef(api as never, 'P-1', readOriginUrl)).rejects.toThrow(
      /could not parse a GitHub owner\/name/,
    )
  })
})
