import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSnippet, deleteSnippet, listSnippets, updateSnippet } from './snippetFileStore'

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'injectables-snippets-'))
  file = join(dir, 'snippets.json')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('snippetFileStore', () => {
  it('returns an empty list before anything is written', async () => {
    expect(await listSnippets(file)).toEqual([])
  })

  it('creates a snippet with the given id and persists it', async () => {
    const created = await createSnippet(file, { name: 'PR', body: '## Summary\n\n- ', allProjects: true, projectIds: [] }, 'id-1')
    expect(created).toMatchObject({ id: 'id-1', name: 'PR', body: '## Summary\n\n- ', allProjects: true, projectIds: [] })
    expect(await listSnippets(file)).toEqual([created])
  })

  it('trims the name but stores the body verbatim', async () => {
    const created = await createSnippet(file, { name: '  Boilerplate  ', body: '  keep  space  ', allProjects: true, projectIds: [] }, 'id-2')
    expect(created.name).toBe('Boilerplate')
    expect(created.body).toBe('  keep  space  ')
  })

  it('collapses projectIds to empty when allProjects is true', async () => {
    const created = await createSnippet(file, { name: 'x', body: 'y', allProjects: true, projectIds: ['P-1'] }, 'id-3')
    expect(created.projectIds).toEqual([])
  })

  it('rejects empty name or empty body', async () => {
    await expect(createSnippet(file, { name: '   ', body: 'y', allProjects: true, projectIds: [] }, 'id-4')).rejects.toThrow()
    await expect(createSnippet(file, { name: 'x', body: '  ', allProjects: true, projectIds: [] }, 'id-5')).rejects.toThrow()
  })

  it('rejects a project-scoped snippet with no target projects', async () => {
    await expect(createSnippet(file, { name: 'x', body: 'y', allProjects: false, projectIds: [] }, 'id-6')).rejects.toThrow()
  })

  it('updates fields and scope of an existing snippet, keeping its id', async () => {
    const created = await createSnippet(file, { name: 'A', body: 'a', allProjects: true, projectIds: [] }, 'id-7')
    const updated = await updateSnippet(file, created.id, { name: 'B', body: 'b', allProjects: false, projectIds: ['P-1'] })
    expect(updated).toEqual({ id: created.id, name: 'B', body: 'b', allProjects: false, projectIds: ['P-1'] })
    expect(await listSnippets(file)).toEqual([updated])
  })

  it('throws when updating an unknown id', async () => {
    await expect(updateSnippet(file, 'nope', { name: 'B', body: 'b', allProjects: true, projectIds: [] })).rejects.toThrow()
  })

  it('deletes a snippet, and deleting an unknown id is a no-op', async () => {
    const created = await createSnippet(file, { name: 'A', body: 'a', allProjects: true, projectIds: [] }, 'id-8')
    await deleteSnippet(file, created.id)
    expect(await listSnippets(file)).toEqual([])
    await expect(deleteSnippet(file, 'nope')).resolves.toBeUndefined()
  })
})
