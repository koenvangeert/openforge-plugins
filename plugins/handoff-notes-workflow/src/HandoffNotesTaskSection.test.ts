// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/svelte'
import type { Task } from '@openforge-app/plugin-sdk/domain'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { clearCollapsedSections } from '@openforge-app/plugin-sdk/collapsibleSectionState'
import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HandoffNotesTaskSection from './HandoffNotesTaskSection.svelte'
import { HANDOFF_NOTES_STORAGE_KEY } from './handoffNotesStorage'

const TASK_ID = 'KVG-2060'
const PROJECT_ID = 'P-1'

function makeTask(): Task {
  return {
    id: TASK_ID,
    initial_prompt: '',
    status: 'doing',
    prompt: null,
    title: null,
    title_source: null,
    title_generated_at: null,
    agent: null,
    permission_mode: null,
    worktree_source: null,
    worktree_branch: null,
    source_ticket_url: null,
    depends_on: [],
    project_id: PROJECT_ID,
    created_at: 0,
    updated_at: 0,
  }
}

async function makeHarness(notes: string) {
  const registry = createOpenForgeRegistryFake({
    pluginId: 'com.openforge.handoff-notes-workflow',
    projectId: PROJECT_ID,
    taskId: TASK_ID,
  })
  await registry.storage.task(TASK_ID).set(HANDOFF_NOTES_STORAGE_KEY, notes)

  const api: FrontendOpenForgeAPI = {
    ...registry.frontendApi,
    tasks: { ...registry.frontendApi.tasks, get: async () => makeTask() },
  }

  return { api }
}

/** Let the in-flight load finish so an absent repaint means absent, not late. */
async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function renderSection(api: FrontendOpenForgeAPI) {
  return render(HandoffNotesTaskSection, {
    props: {
      api,
      context: api.context.getSnapshot(),
      taskId: TASK_ID,
      projectId: PROJECT_ID,
      taskActionPending: false,
    },
  })
}

describe('HandoffNotesTaskSection', () => {
  beforeEach(() => {
    clearCollapsedSections()
  })

  it('heads the section with a decorative icon that leaves the toggle name intact', async () => {
    const { api } = await makeHarness('Ready to hand off.')

    renderSection(api)

    const toggle = screen.getByRole('button', { name: 'Handoff Notes' })
    expect(toggle.querySelector('[aria-hidden="true"] svg')).toBeTruthy()
  })

  it('starts expanded and collapses the notes away on toggle', async () => {
    const { api } = await makeHarness('Ready to hand off.')

    renderSection(api)

    const toggle = screen.getByRole('button', { name: 'Handoff Notes' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(await screen.findByText('Ready to hand off.')).toBeTruthy()

    await fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Ready to hand off.')).toBeNull()

    await fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(await screen.findByText('Ready to hand off.')).toBeTruthy()
  })

  it('remembers a collapsed section across remounts', async () => {
    const { api } = await makeHarness('Ready to hand off.')

    const view = renderSection(api)
    await fireEvent.click(screen.getByRole('button', { name: 'Handoff Notes' }))
    view.unmount()

    renderSection(api)

    const toggle = screen.getByRole('button', { name: 'Handoff Notes' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps the notes painted through host re-renders of the same Task', async () => {
    const { api: base } = await makeHarness('Ready to hand off.')
    const get = vi.fn(async () => makeTask())
    const api: FrontendOpenForgeAPI = { ...base, tasks: { ...base.tasks, get } }

    const view = renderSection(api)
    expect(await screen.findByText('Ready to hand off.')).toBeTruthy()
    await settled()
    expect(get).toHaveBeenCalledTimes(1)

    const content = view.container.querySelector('[id^="info-section-"]') as HTMLElement
    const repaints: string[] = []
    const observer = new MutationObserver(() => repaints.push(content.textContent ?? ''))
    observer.observe(content, { childList: true, subtree: true, characterData: true })

    for (let tick = 0; tick < 3; tick += 1) {
      await view.rerender({
        api: { ...api },
        context: api.context.getSnapshot(),
        taskId: TASK_ID,
        projectId: PROJECT_ID,
        taskActionPending: false,
      })
      await settled()
    }
    observer.disconnect()

    expect(repaints).toEqual([])
    expect(get).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Ready to hand off.')).toBeTruthy()
    expect(screen.queryByText('Loading Handoff Notes…')).toBeNull()
  })
})
