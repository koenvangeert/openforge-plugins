// @vitest-environment jsdom

import { render, screen } from '@testing-library/svelte'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { describe, expect, it } from 'vitest'
import TaskSpendSection from './TaskSpendSection.svelte'
import type { TaskSpendData } from './dashboard'

function api(spend: Partial<TaskSpendData> = {}): FrontendOpenForgeAPI {
  return {
    backend: {
      whenReady: async () => undefined,
      invoke: async (_method: string, payload: { taskId: string }) => ({
        taskId: payload.taskId,
        found: true,
        total: 1.5,
        ...spend,
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

  it('shows a dash for a task no claude session was recorded against', async () => {
    render(TaskSpendSection, { props: { api: api({ found: false, total: 0 }), taskId: 'T-1' } as never })
    await settle()

    expect(screen.getByText('—')).toBeTruthy()
  })

  it('shows zero for a task whose recorded spend priced to nothing', async () => {
    render(TaskSpendSection, { props: { api: api({ found: true, total: 0 }), taskId: 'T-1' } as never })
    await settle()

    expect(screen.getByText('$0.00')).toBeTruthy()
  })

  it('shows neither a figure nor a dash while the spend is in flight', () => {
    render(TaskSpendSection, { props: { api: api(), taskId: 'T-1' } as never })

    expect(screen.getByText('…')).toBeTruthy()
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
