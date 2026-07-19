// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import type { CommandInfo } from '@openforge-app/plugin-sdk'
import type { Snippet } from './lib/injectableDomain'
import { METHOD } from './lib/protocol'
import InjectablesView from './InjectablesView.svelte'

vi.mock('@openforge-app/plugin-sdk/ui/MarkdownContent.svelte', async () => ({
  default: (await import('./test/MarkdownContentTestDouble.svelte')).default,
}))

const skill = (name: string, over: Partial<CommandInfo> = {}): CommandInfo => ({
  name, description: 'desc', source: 'skill', agent: null, origin: 'personal',
  triggerMode: 'auto+manual', sourceDir: '.claude', sourcePath: name, content: `# ${name}\nBody of ${name}`, ...over,
})

interface SnippetInput {
  name: string
  body: string
  allProjects: boolean
  projectIds: string[]
}

/** A stateful `backend.invoke` fake that mirrors the real snippet backend
 * (Task 3): an in-memory array dispatched on by method name, so the view's
 * snippet CRUD is exercised end-to-end instead of mocking `loadInjectableCatalog`
 * or the view's internals directly. */
function makeApi(catalog: CommandInfo[], initialSnippets: Snippet[] = []) {
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
    commands: { listCatalog: vi.fn(async () => catalog) },
    backend: { whenReady: vi.fn(async () => undefined), invoke },
    navigation: { navigate: vi.fn(async () => undefined) },
    system: { openUrl: vi.fn(async () => undefined) },
  }
  return { api, invoke, getSnippets: () => snippets }
}

function renderView(api: unknown, projectId: string | null = 'P-1') {
  return render(InjectablesView, { props: { api, context: {}, projectName: 'Project', projectId } as never })
}

describe('InjectablesView', () => {
  it('lists catalog skills/commands and backend snippets', async () => {
    const { api } = makeApi(
      [skill('refactor')],
      [{ id: 'snip-1', name: 'PR boilerplate', body: '## Summary', allProjects: true, projectIds: [] }],
    )

    renderView(api)

    // 'refactor' is a skill (list only); the snippet auto-selects, so its name
    // shows in both the list and the detail header — hence getAllByText.
    expect((await screen.findAllByText('refactor')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('PR boilerplate').length).toBeGreaterThan(0)
  })

  it('renders the reading pane for the selected item', async () => {
    const { api } = makeApi([skill('refactor')])
    renderView(api)

    // The single skill auto-selects, so its content renders without a click.
    await waitFor(() => expect(screen.getByTestId('markdown-body')).toBeTruthy())
    expect(screen.getByText('Body of refactor')).toBeTruthy()
  })

  it('creates a snippet and persists it through the backend', async () => {
    const { api, invoke, getSnippets } = makeApi([])
    renderView(api)

    await fireEvent.click(await screen.findByText('+ Snippet'))
    await fireEvent.input(screen.getByPlaceholderText('Name'), { target: { value: 'My snip' } })
    await fireEvent.input(screen.getByPlaceholderText(/Body/), { target: { value: 'hello world' } })
    await fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(getSnippets()).toHaveLength(1))
    expect(getSnippets()[0]).toMatchObject({ name: 'My snip', body: 'hello world', allProjects: true })
    expect(invoke).toHaveBeenCalledWith(
      METHOD.createSnippet,
      expect.objectContaining({ name: 'My snip', body: 'hello world', allProjects: true }),
    )
  })

  it('deletes a snippet after confirmation', async () => {
    const { api, getSnippets } = makeApi([], [{ id: 'snip-1', name: 'Doomed', body: 'x', allProjects: true, projectIds: [] }])

    renderView(api)

    // The lone snippet auto-selects, so Delete is already available.
    await fireEvent.click(await screen.findByText('Delete'))
    await fireEvent.click(screen.getByText('Confirm delete'))

    await waitFor(() => expect(getSnippets()).toHaveLength(0))
  })

  it('preserves a single-project snippet scope when editing and saving', async () => {
    // Scoped to project P-1 (the projectId renderView defaults to) — not "all projects".
    const { api, invoke, getSnippets } = makeApi(
      [],
      [{ id: 'snip-1', name: 'Scoped', body: 'original body', allProjects: false, projectIds: ['P-1'] }],
    )

    renderView(api)

    // The lone snippet auto-selects, so Edit is already available.
    await fireEvent.click(await screen.findByText('Edit'))
    await fireEvent.input(screen.getByPlaceholderText(/Body/), { target: { value: 'edited body' } })
    await fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(getSnippets()[0]?.body).toBe('edited body'))
    expect(getSnippets()[0]).toMatchObject({ allProjects: false, projectIds: ['P-1'] })
    expect(invoke).toHaveBeenCalledWith(
      METHOD.updateSnippet,
      expect.objectContaining({ allProjects: false, projectIds: ['P-1'] }),
    )
  })
})
