import type { PluginStorage } from '@openforge-app/plugin-sdk'
import { createMemoryPluginStorage } from '@openforge-app/plugin-sdk/testing'
import { describe, expect, it } from 'vitest'
import { useIssuesCollapsedColumns } from './useIssuesCollapsedColumns.svelte'

function setup(storage: PluginStorage = createMemoryPluginStorage()) {
  return { storage, columns: useIssuesCollapsedColumns({ storage }) }
}

describe('useIssuesCollapsedColumns', () => {
  it('starts with every column expanded', async () => {
    const { columns } = setup()

    await columns.activateProject('proj-1')

    expect([...columns.collapsedLabels]).toEqual([])
  })

  it('stores collapsed columns in project storage', async () => {
    const { storage, columns } = setup()
    await columns.activateProject('proj-1')

    columns.toggle('bug')
    columns.toggle('')

    expect([...columns.collapsedLabels]).toEqual(['bug', ''])
    await expect(storage.project('proj-1').get('collapsedColumns')).resolves.toEqual(['bug', ''])

    columns.toggle('bug')

    expect([...columns.collapsedLabels]).toEqual([''])
    await expect(storage.project('proj-1').get('collapsedColumns')).resolves.toEqual([''])
  })

  it('restores the stored columns of each project', async () => {
    const storage = createMemoryPluginStorage()
    await storage.project('proj-1').set('collapsedColumns', ['bug'])
    await storage.project('proj-2').set('collapsedColumns', ['docs'])
    const { columns } = setup(storage)

    await columns.activateProject('proj-1')
    expect([...columns.collapsedLabels]).toEqual(['bug'])

    await columns.activateProject('proj-2')
    expect([...columns.collapsedLabels]).toEqual(['docs'])
  })

  it('applies a toggle made before the stored columns load on top of them', async () => {
    const storage = createMemoryPluginStorage()
    await storage.project('proj-1').set('collapsedColumns', ['bug'])
    const { columns } = setup(storage)

    // Until the stored set loads, every column shows expanded, so each first click
    // collapses. Toggling `docs` twice leaves it expanded.
    const loading = columns.activateProject('proj-1')
    columns.toggle('ready')
    columns.toggle('docs')
    columns.toggle('docs')
    await loading

    expect([...columns.collapsedLabels]).toEqual(['bug', 'ready'])
    await expect(storage.project('proj-1').get('collapsedColumns')).resolves.toEqual(['bug', 'ready'])
  })

  it('ignores a stored set that arrives after a newer project activation', async () => {
    const storage = createMemoryPluginStorage()
    await storage.project('proj-1').set('collapsedColumns', ['bug'])
    const { columns } = setup(storage)

    const first = columns.activateProject('proj-1')
    await columns.activateProject('proj-2')
    await first

    expect([...columns.collapsedLabels]).toEqual([])
  })

  it('does nothing without a project', async () => {
    const { columns } = setup()
    await columns.activateProject(null)

    columns.toggle('bug')

    expect([...columns.collapsedLabels]).toEqual([])
  })
})
