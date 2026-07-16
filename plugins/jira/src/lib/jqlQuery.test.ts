import { describe, expect, it, vi } from 'vitest'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { createMemoryPluginStorage } from '@openforge-app/plugin-sdk/testing'
import type { SearchResult } from './jiraTypes'
import { readLastJql, runQuery } from './jqlQuery'
import { GLOBAL_KEY } from './protocol'

type Api = Pick<FrontendOpenForgeAPI, 'storage' | 'backend'>

function makeApi(invoke: (method: string, payload?: unknown) => Promise<unknown> = async () => ({ ok: true, rows: [] })) {
  const storage = createMemoryPluginStorage()
  const invokeSpy = vi.fn(invoke)
  const api: Api = {
    storage,
    backend: {
      state: 'ready',
      whenReady: async () => undefined,
      onReady: () => ({ dispose: () => undefined }),
      invoke: invokeSpy as FrontendOpenForgeAPI['backend']['invoke'],
    },
  }
  return { api, storage, invokeSpy }
}

describe('readLastJql', () => {
  it('defaults to empty', async () => {
    const { api } = makeApi()
    expect(await readLastJql(api)).toBe('')
  })

  it('reads the remembered query', async () => {
    const { api, storage } = makeApi()
    await storage.global.set(GLOBAL_KEY.lastJql, 'project = KVG')
    expect(await readLastJql(api)).toBe('project = KVG')
  })
})

describe('runQuery', () => {
  it('rejects an empty query without hitting the backend', async () => {
    const { api, invokeSpy } = makeApi()
    const result = await runQuery(api, '   ')
    expect(result).toMatchObject({ ok: false, error: 'invalid-jql' })
    expect(invokeSpy).not.toHaveBeenCalled()
  })

  it('remembers the query and returns backend rows', async () => {
    const rows: SearchResult = { ok: true, rows: [{ key: 'KVG-1', summary: 'S', status: 'Open', issueType: 'Task', assignee: null, url: 'u' }] }
    const { api, storage, invokeSpy } = makeApi(async () => rows)
    const result = await runQuery(api, '  project = KVG  ')
    expect(result).toEqual(rows)
    expect(invokeSpy).toHaveBeenCalledWith('search', { jql: 'project = KVG' })
    expect(await storage.global.get(GLOBAL_KEY.lastJql)).toBe('project = KVG')
  })

  it('surfaces empty results', async () => {
    const { api } = makeApi(async () => ({ ok: true, rows: [] }))
    expect(await runQuery(api, 'project = EMPTY')).toEqual({ ok: true, rows: [] })
  })

  it('passes a backend invalid-jql error through', async () => {
    const { api } = makeApi(async () => ({ ok: false, error: 'invalid-jql', message: 'bad jql' }))
    expect(await runQuery(api, 'garbage')).toEqual({ ok: false, error: 'invalid-jql', message: 'bad jql' })
  })
})
