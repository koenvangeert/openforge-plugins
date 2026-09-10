// @vitest-environment jsdom

import { render, screen } from '@testing-library/svelte'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { describe, expect, it } from 'vitest'
import TaskSpendSection from './TaskSpendSection.svelte'

function api(): FrontendOpenForgeAPI {
  return {
    backend: {
      whenReady: async () => undefined,
      invoke: async (_method: string, payload: { taskId: string }) => ({
        taskId: payload.taskId,
        found: true,
        total: 1.5,
      }),
    },
  } as unknown as FrontendOpenForgeAPI
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('TaskSpendSection', () => {
  it('shows the task spend', async () => {
    render(TaskSpendSection, { props: { api: api(), taskId: 'T-1' } as never })
    await settle()

    expect(screen.getByText('$1.50')).toBeTruthy()
  })

  it('survives the host dropping the task while the figure is in flight', async () => {
    let task: { id: string } | null = { id: 'T-1' }
    const props = {
      api: api(),
      get taskId(): string {
        if (!task) throw new TypeError("Cannot read properties of null (reading 'id')")
        return task.id
      },
    }

    render(TaskSpendSection, { props: props as never })
    task = null
    await settle()

    expect(screen.getByText('$1.50')).toBeTruthy()
  })
})
