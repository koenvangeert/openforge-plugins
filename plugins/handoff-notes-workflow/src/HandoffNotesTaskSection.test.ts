// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/svelte'
import type { Task } from '@openforge-app/plugin-sdk/domain'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import { describe, expect, it } from 'vitest'
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
})
