// @vitest-environment jsdom
import { render, fireEvent, waitFor } from '@testing-library/svelte'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ComponentProps } from 'svelte'
import type { Project } from '@openforge-app/plugin-sdk'
import type { Injectable, Snippet } from './lib/injectableDomain'
import { METHOD } from './lib/protocol'

const reload = vi.fn().mockResolvedValue(undefined)

const fixtureInjectables: Injectable[] = [
  {
    id: 'project:skill:refactor',
    kind: 'skill',
    name: 'refactor',
    description: 'restructure code',
    origin: 'project',
    triggerMode: 'auto+manual',
    sourceDir: '.claude',
    sourcePath: 'refactor',
    content: '---\nname: refactor\n---\nbody text',
    invocationText: '/refactor ',
  },
  {
    id: 'personal:skill:pr-writer',
    kind: 'skill',
    name: 'pr-writer',
    description: 'writes prs',
    origin: 'personal',
    triggerMode: 'auto+manual',
    sourceDir: '.claude',
    sourcePath: 'pr-writer',
    content: 'pr body',
    invocationText: '/pr-writer ',
  },
  {
    id: 'snippet:s1',
    kind: 'snippet',
    name: 'pr-boilerplate',
    description: null,
    origin: 'personal',
    triggerMode: 'manual-only',
    sourceDir: null,
    sourcePath: null,
    content: 'Summary body',
    invocationText: 'Summary body',
  },
]

// Raw snippets (with scope) for the editor's "Available in" checklist.
const fixtureSnippets: Snippet[] = [
  { id: 's1', name: 'pr-boilerplate', body: 'Summary body', allProjects: true, projectIds: [] },
]

vi.mock('./lib/useInjectableCatalog.svelte', () => ({
  useInjectableCatalog: () => ({
    injectables: fixtureInjectables,
    snippets: fixtureSnippets,
    loading: false,
    error: null,
    reload,
  }),
}))

vi.mock('@openforge-app/plugin-sdk/ui/MarkdownContent.svelte', async () => ({
  default: (await import('./test/MarkdownContentTestDouble.svelte')).default,
}))

import InjectablePicker from './InjectablePicker.svelte'

type PickerProps = ComponentProps<typeof InjectablePicker>

interface SnippetInput {
  name: string
  body: string
  allProjects: boolean
  projectIds: string[]
}

const FIXTURE_PROJECTS: Project[] = [
  { id: 'P-1', name: 'Alpha', path: '/alpha', created_at: 0, updated_at: 0 },
  { id: 'P-2', name: 'Beta', path: '/beta', created_at: 0, updated_at: 0 },
]

/** A stateful `backend.invoke` fake that mirrors InjectablesView.test.ts's `makeApi`: an
 * in-memory snippet array dispatched on by method name, so the picker's snippet + personal
 * skill CRUD is exercised through the real `api.backend.invoke(METHOD.*, ...)` surface
 * instead of mocking the picker's internals directly. */
function makeApi(initialSnippets: Snippet[] = fixtureSnippets) {
  let snippets: Snippet[] = [...initialSnippets]
  let nextId = 0

  const invoke = vi.fn(async (method: string, payload?: unknown): Promise<unknown> => {
    switch (method) {
      case METHOD.listSnippets:
        return snippets
      case METHOD.createSnippet: {
        const input = payload as SnippetInput
        const created: Snippet = {
          id: `snip-${nextId++}`,
          name: input.name.trim(),
          body: input.body,
          allProjects: input.allProjects,
          projectIds: input.allProjects ? [] : input.projectIds,
        }
        snippets = [...snippets, created]
        return created
      }
      case METHOD.updateSnippet: {
        const input = payload as SnippetInput & { id: string }
        const updated: Snippet = {
          id: input.id,
          name: input.name.trim(),
          body: input.body,
          allProjects: input.allProjects,
          projectIds: input.allProjects ? [] : input.projectIds,
        }
        snippets = snippets.map((s) => (s.id === input.id ? updated : s))
        return updated
      }
      case METHOD.deleteSnippet: {
        const { id } = payload as { id: string }
        snippets = snippets.filter((s) => s.id !== id)
        return undefined
      }
      case METHOD.saveSkillContent:
      case METHOD.deleteSkill:
        return undefined
      default:
        throw new Error(`Unexpected method invoked: ${method}`)
    }
  })

  const api = {
    commands: { listCatalog: vi.fn(async () => []) },
    backend: { whenReady: vi.fn(async () => undefined), invoke },
    projects: { list: vi.fn(async () => FIXTURE_PROJECTS) },
  }
  return { api, invoke, getSnippets: () => snippets }
}

const props = (over: Record<string, unknown> = {}): PickerProps =>
  ({
    api: makeApi().api,
    projectId: 'P-1',
    open: true,
    onClose: vi.fn(),
    onSelect: vi.fn(),
    ...over,
  }) as unknown as PickerProps

describe('InjectablePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens with the preview closed and nothing selected', () => {
    const { queryByText } = render(InjectablePicker, { props: props() })
    expect(queryByText('Insert into prompt')).toBeNull()
  })

  it('clicking a row opens the preview; inserting yields that injectable and closes', async () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    const { getByText } = render(InjectablePicker, { props: props({ onSelect, onClose }) })
    await fireEvent.click(getByText('refactor'))
    await fireEvent.click(getByText('Insert into prompt'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ invocationText: '/refactor ' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('clicking the already-selected row again closes the preview', async () => {
    const { getByText, queryByText } = render(InjectablePicker, { props: props() })
    await fireEvent.click(getByText('refactor'))
    expect(queryByText('Insert into prompt')).not.toBeNull()
    const row = document.querySelector('[data-injectable-id="project:skill:refactor"]')!
    await fireEvent.click(row)
    expect(queryByText('Insert into prompt')).toBeNull()
  })

  it('the ✕ button closes the preview', async () => {
    const { getByText, getByLabelText, queryByText } = render(InjectablePicker, { props: props() })
    await fireEvent.click(getByText('refactor'))
    await fireEvent.click(getByLabelText('Close preview'))
    expect(queryByText('Insert into prompt')).toBeNull()
  })

  it('selecting a different row then inserting yields that injectable', async () => {
    const onSelect = vi.fn()
    const { getByText } = render(InjectablePicker, { props: props({ onSelect }) })
    await fireEvent.click(getByText('pr-writer'))
    await fireEvent.click(getByText('Insert into prompt'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ invocationText: '/pr-writer ' }))
  })

  it('arrow keys move through headers + items and Enter inserts an item', async () => {
    const onSelect = vi.fn()
    const { getByPlaceholderText } = render(InjectablePicker, { props: props({ onSelect }) })
    const input = getByPlaceholderText('Search injectables…')
    // Rows in order: group:snippet, snippet:s1, group:personal, personal:skill:pr-writer,
    // group:project, project:skill:refactor. 6 downs land on refactor.
    for (let i = 0; i < 6; i++) await fireEvent.keyDown(input, { key: 'ArrowDown' })
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ invocationText: '/refactor ' }))
  })

  it('filters the list by search query', async () => {
    const { getByPlaceholderText, queryByText } = render(InjectablePicker, { props: props() })
    await fireEvent.input(getByPlaceholderText('Search injectables…'), { target: { value: 'zzz-no-match' } })
    expect(queryByText('pr-writer')).toBeNull()
  })

  it('defaults to rendered view, toggles to raw, and keeps the choice across selections', async () => {
    const { getByText, queryByTestId } = render(InjectablePicker, { props: props() })
    await fireEvent.click(getByText('refactor'))
    expect(queryByTestId('injectable-content-md')).not.toBeNull()
    expect(queryByTestId('injectable-content-raw')).toBeNull()

    await fireEvent.click(getByText('Raw'))
    expect(queryByTestId('injectable-content-raw')).not.toBeNull()
    expect(queryByTestId('injectable-content-md')).toBeNull()

    // Choice persists when switching to another injectable.
    await fireEvent.click(getByText('pr-writer'))
    expect(queryByTestId('injectable-content-raw')).not.toBeNull()
  })

  it('resets the view toggle back to rendered when the dialog is reopened', async () => {
    const { getByText, queryByTestId, rerender } = render(InjectablePicker, { props: props() })
    await fireEvent.click(getByText('refactor'))
    await fireEvent.click(getByText('Raw'))
    expect(queryByTestId('injectable-content-raw')).not.toBeNull()

    await rerender(props({ open: false }))
    await rerender(props({ open: true }))
    await fireEvent.click(getByText('refactor'))
    expect(queryByTestId('injectable-content-md')).not.toBeNull()
    expect(queryByTestId('injectable-content-raw')).toBeNull()
  })

  it('offers Edit/Delete only for personal skills', async () => {
    const { getByText, queryByText } = render(InjectablePicker, { props: props() })
    await fireEvent.click(getByText('refactor')) // project origin -> read-only
    expect(queryByText('Edit')).toBeNull()
    await fireEvent.click(getByText('pr-writer')) // personal origin -> editable
    expect(queryByText('Edit')).not.toBeNull()
  })

  it('editing a personal skill saves via api.backend.invoke and reloads the catalog', async () => {
    const { api, invoke } = makeApi()
    const { getByText, getByTestId } = render(InjectablePicker, { props: props({ api }) })
    await fireEvent.click(getByText('pr-writer'))
    await fireEvent.click(getByText('Edit'))
    await fireEvent.input(getByTestId('skill-editor'), { target: { value: 'updated body' } })
    await fireEvent.click(getByText('Save'))
    expect(invoke).toHaveBeenCalledWith(
      METHOD.saveSkillContent,
      expect.objectContaining({
        name: 'pr-writer',
        content: 'updated body',
        level: 'user',
        sourceDir: '.claude',
        sourcePath: 'pr-writer',
      }),
    )
    await waitFor(() => expect(reload).toHaveBeenCalled())
  })

  it('deleting a personal skill confirms first, then calls api.backend.invoke(deleteSkill)', async () => {
    const { api, invoke } = makeApi()
    const { getByText, getByTestId, queryByTestId } = render(InjectablePicker, { props: props({ api }) })
    await fireEvent.click(getByText('pr-writer'))
    expect(invoke).not.toHaveBeenCalledWith(METHOD.deleteSkill, expect.anything())
    await fireEvent.click(getByText('Delete')) // opens confirmation
    await fireEvent.click(getByTestId('confirm-delete'))
    expect(invoke).toHaveBeenCalledWith(
      METHOD.deleteSkill,
      expect.objectContaining({ name: 'pr-writer', level: 'user', sourceDir: '.claude', sourcePath: 'pr-writer' }),
    )
    await waitFor(() => expect(queryByTestId('confirm-delete')).toBeNull())
  })

  it('while editing, arrows/Enter stay in the textarea and Escape cancels the edit', async () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    const { getByText, getByTestId, queryByTestId } = render(InjectablePicker, {
      props: props({ onSelect, onClose }),
    })
    await fireEvent.click(getByText('pr-writer'))
    await fireEvent.click(getByText('Edit'))
    const editor = getByTestId('skill-editor')

    // Navigation keys must not move the selection or insert while editing.
    await fireEvent.keyDown(editor, { key: 'ArrowDown' })
    await fireEvent.keyDown(editor, { key: 'Enter' })
    expect(onSelect).not.toHaveBeenCalled()
    expect(queryByTestId('skill-editor')).not.toBeNull()

    // Escape cancels the edit without closing the whole picker.
    await fireEvent.keyDown(editor, { key: 'Escape' })
    expect(queryByTestId('skill-editor')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('lists a snippet and inserts it as its literal body', async () => {
    const onSelect = vi.fn()
    const { getByText } = render(InjectablePicker, { props: props({ onSelect }) })
    expect(getByText('pr-boilerplate')).not.toBeNull()
    await fireEvent.click(getByText('pr-boilerplate'))
    await fireEvent.click(getByText('Insert into prompt'))
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'snippet', invocationText: 'Summary body' }),
    )
  })

  it('offers Edit and Delete for a snippet', async () => {
    const { getByText, queryByText } = render(InjectablePicker, { props: props() })
    await fireEvent.click(getByText('pr-boilerplate'))
    expect(queryByText('Edit')).not.toBeNull()
    expect(queryByText('Delete')).not.toBeNull()
  })

  it('creating a snippet calls api.backend.invoke(createSnippet) and reloads the catalog', async () => {
    const { api, invoke, getSnippets } = makeApi([])
    const { getByText, getByTestId } = render(InjectablePicker, { props: props({ api }) })
    await fireEvent.click(getByText('New snippet'))
    await fireEvent.input(getByTestId('snippet-name'), { target: { value: 'My Snippet' } })
    await fireEvent.input(getByTestId('snippet-editor'), { target: { value: 'the body' } })
    await fireEvent.click(getByText('Save'))
    expect(invoke).toHaveBeenCalledWith(METHOD.createSnippet, {
      name: 'My Snippet',
      body: 'the body',
      allProjects: true,
      projectIds: [],
    })
    await waitFor(() => expect(reload).toHaveBeenCalled())
    expect(getSnippets()).toHaveLength(1)
  })

  it('auto-saves project scope from the header dropdown (no Save click)', async () => {
    const { api, invoke } = makeApi()
    const { getByText, getByTestId } = render(InjectablePicker, { props: props({ api }) })
    await fireEvent.click(getByText('pr-boilerplate'))
    await fireEvent.click(getByTestId('scope-menu-trigger'))
    // Raw scope is "All"; unticking Beta (P-2) narrows to just Alpha (P-1) and auto-saves,
    // preserving the snippet's title + body.
    await waitFor(() => expect(getByTestId('scope-project-P-2')).not.toBeNull())
    await fireEvent.click(getByTestId('scope-project-P-2'))
    expect(invoke).toHaveBeenCalledWith(METHOD.updateSnippet, {
      id: 's1',
      name: 'pr-boilerplate',
      body: 'Summary body',
      allProjects: false,
      projectIds: ['P-1'],
    })
    await waitFor(() => expect(reload).toHaveBeenCalled())
  })

  it('keeps the project checklist out of the edit form (scope lives in the dropdown)', async () => {
    const { getByText, getByTestId, queryByTestId } = render(InjectablePicker, { props: props() })
    await fireEvent.click(getByText('pr-boilerplate'))
    await fireEvent.click(getByText('Edit'))
    expect(getByTestId('snippet-name')).not.toBeNull()
    expect(queryByTestId('scope-all')).toBeNull()
  })

  it('editing a snippet calls api.backend.invoke(updateSnippet) with its db id and reloads', async () => {
    const { api, invoke } = makeApi()
    const { getByText, getByTestId } = render(InjectablePicker, { props: props({ api }) })
    await fireEvent.click(getByText('pr-boilerplate'))
    await fireEvent.click(getByText('Edit'))
    await fireEvent.input(getByTestId('snippet-name'), { target: { value: 'Renamed' } })
    await fireEvent.input(getByTestId('snippet-editor'), { target: { value: 'new body' } })
    await fireEvent.click(getByText('Save'))
    expect(invoke).toHaveBeenCalledWith(METHOD.updateSnippet, {
      id: 's1',
      name: 'Renamed',
      body: 'new body',
      allProjects: true,
      projectIds: [],
    })
    await waitFor(() => expect(reload).toHaveBeenCalled())
  })

  it('deleting a snippet confirms first, then calls api.backend.invoke(deleteSnippet) with its db id', async () => {
    const { api, invoke } = makeApi()
    const { getByText, getByTestId, queryByTestId } = render(InjectablePicker, { props: props({ api }) })
    await fireEvent.click(getByText('pr-boilerplate'))
    expect(invoke).not.toHaveBeenCalledWith(METHOD.deleteSnippet, expect.anything())
    await fireEvent.click(getByText('Delete'))
    await fireEvent.click(getByTestId('confirm-delete'))
    expect(invoke).toHaveBeenCalledWith(METHOD.deleteSnippet, { id: 's1' })
    await waitFor(() => expect(queryByTestId('confirm-delete')).toBeNull())
  })

  it('⌘2 cycles the filter to snippets-only and ⌘1 returns to All', async () => {
    const { getByPlaceholderText, queryByText } = render(InjectablePicker, { props: props() })
    const input = getByPlaceholderText('Search injectables…')
    // Default "All": every item visible.
    expect(queryByText('refactor')).not.toBeNull()
    expect(queryByText('pr-boilerplate')).not.toBeNull()
    // ⌘2 → cursor moves All → Snippets (single-select).
    await fireEvent.keyDown(input, { key: '2', metaKey: true })
    expect(queryByText('pr-boilerplate')).not.toBeNull()
    expect(queryByText('refactor')).toBeNull()
    expect(queryByText('pr-writer')).toBeNull()
    // ⌘1 → back to All.
    await fireEvent.keyDown(input, { key: '1', metaKey: true })
    expect(queryByText('refactor')).not.toBeNull()
    expect(queryByText('pr-writer')).not.toBeNull()
  })

  it('the All chip clears an active multi-select filter', async () => {
    const { getByTestId, queryByText } = render(InjectablePicker, { props: props() })
    await fireEvent.click(getByTestId('filter-chip-personal'))
    expect(queryByText('pr-writer')).not.toBeNull() // personal skill kept
    expect(queryByText('refactor')).toBeNull() // project skill hidden
    await fireEvent.click(getByTestId('filter-chip-all'))
    expect(queryByText('refactor')).not.toBeNull() // everything back
  })

  it('one Tab from the search input moves focus straight to the first list row', async () => {
    const { getByPlaceholderText } = render(InjectablePicker, { props: props() })
    const input = getByPlaceholderText('Search injectables…')
    await fireEvent.keyDown(input, { key: 'Tab' })
    // The first row is the leading group header.
    const firstRow = document.querySelector('[data-injectable-id]')
    expect(document.activeElement).toBe(firstRow)
    expect(firstRow?.getAttribute('data-injectable-id')).toBe('group:snippet')
  })

  it('arrow navigation moves DOM focus onto the active row', async () => {
    const { getByPlaceholderText } = render(InjectablePicker, { props: props() })
    const input = getByPlaceholderText('Search injectables…')
    await fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(document.querySelector('[data-injectable-id="group:snippet"]'))
  })

  it('⌘ filter change keeps focus in the list, re-homing when the active row is filtered out', async () => {
    render(InjectablePicker, { props: props() })
    const snippetRow = document.querySelector('[data-injectable-id="snippet:s1"]') as HTMLElement
    snippetRow.focus()
    expect(document.activeElement).toBe(snippetRow)
    // ⌘2 → Snippets (row survives), ⌘2 → Personal (snippet row removed → focus re-homes
    // to the first row of the filtered list, the Personal header).
    await fireEvent.keyDown(snippetRow, { key: '2', metaKey: true })
    await fireEvent.keyDown(snippetRow, { key: '2', metaKey: true })
    await waitFor(() =>
      expect(document.activeElement).toBe(
        document.querySelector('[data-injectable-id="group:personal"]'),
      ),
    )
  })

  it('ArrowLeft on an item collapses its group and moves to the header; ArrowRight re-expands', async () => {
    const { getByPlaceholderText } = render(InjectablePicker, { props: props() })
    const input = getByPlaceholderText('Search injectables…')
    // Move down to the snippet item (group:snippet → snippet:s1), then Left.
    await fireEvent.keyDown(input, { key: 'ArrowDown' })
    await fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(document.querySelector('[data-injectable-id="snippet:s1"]'))
    await fireEvent.keyDown(input, { key: 'ArrowLeft' })
    // Group collapsed → the item row is gone and focus is on the header.
    await waitFor(() => expect(document.querySelector('[data-injectable-id="snippet:s1"]')).toBeNull())
    expect(document.activeElement).toBe(document.querySelector('[data-injectable-id="group:snippet"]'))
    // ArrowRight re-expands and the item reappears.
    await fireEvent.keyDown(input, { key: 'ArrowRight' })
    await waitFor(() =>
      expect(document.querySelector('[data-injectable-id="snippet:s1"]')).not.toBeNull(),
    )
  })

  it('Tab from a list row moves focus into the detail panel; Shift+Tab returns to the row', async () => {
    const { getByText } = render(InjectablePicker, { props: props() })
    await fireEvent.click(getByText('pr-boilerplate'))
    const row = document.querySelector('[data-injectable-id="snippet:s1"]') as HTMLElement
    row.focus()
    await fireEvent.keyDown(row, { key: 'Tab' })
    const detail = document.querySelector('.border-l') as HTMLElement
    expect(detail.contains(document.activeElement)).toBe(true)
    await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(row)
  })

  it('keyboard nav keeps the list full-width; Space toggles the detail panel', async () => {
    const { getByPlaceholderText, queryByText } = render(InjectablePicker, { props: props() })
    const input = getByPlaceholderText('Search injectables…')
    await fireEvent.keyDown(input, { key: 'ArrowDown' }) // group:snippet
    await fireEvent.keyDown(input, { key: 'ArrowDown' }) // snippet:s1 (item)
    // Navigation does NOT auto-open the detail pane.
    expect(queryByText('Insert into prompt')).toBeNull()
    const row = document.querySelector('[data-injectable-id="snippet:s1"]') as HTMLElement
    await fireEvent.keyDown(row, { key: ' ' })
    expect(queryByText('Insert into prompt')).not.toBeNull() // Space opened it
    await fireEvent.keyDown(
      document.querySelector('[data-injectable-id="snippet:s1"]') as HTMLElement,
      { key: ' ' },
    )
    expect(queryByText('Insert into prompt')).toBeNull() // Space closed it
  })
})
