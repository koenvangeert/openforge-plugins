import type { PluginStorage, TasksAPI } from '@openforge-app/plugin-sdk'
import { TaskFollowUpError } from '@openforge-app/plugin-sdk'
import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import { describe, expect, it, vi } from 'vitest'
import { requestDiagram } from './prLensRequest'
import { DEFAULT_PROMPT_TEMPLATE, savePromptTemplate } from './prLensTemplate'

const PROJECT_ID = 'P-1'
const TASK_ID = 'T-1'

function makeDeps(sendFollowUp: TasksAPI['sendFollowUp']): {
  tasks: Pick<TasksAPI, 'sendFollowUp'>
  storage: PluginStorage
} {
  const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.pr-lens' })
  return { tasks: { sendFollowUp }, storage: registry.storage }
}

function receipt(disposition: 'delivered' | 'queued') {
  return vi.fn(async () => ({ taskId: TASK_ID, sessionId: 'S-1', disposition }))
}

describe('requestDiagram', () => {
  it("sends the project's default prompt to the task's agent", async () => {
    const sendFollowUp = receipt('delivered')
    const deps = makeDeps(sendFollowUp)

    await expect(requestDiagram(deps, { taskId: TASK_ID, projectId: PROJECT_ID }))
      .resolves.toEqual({ status: 'delivered' })
    expect(sendFollowUp).toHaveBeenCalledWith({
      taskId: TASK_ID,
      message: DEFAULT_PROMPT_TEMPLATE,
    })
  })

  it("sends the project's saved prompt when it has one", async () => {
    const sendFollowUp = receipt('delivered')
    const deps = makeDeps(sendFollowUp)
    await savePromptTemplate(deps.storage, PROJECT_ID, 'Draw it my way.')

    await requestDiagram(deps, { taskId: TASK_ID, projectId: PROJECT_ID })

    expect(sendFollowUp).toHaveBeenCalledWith({ taskId: TASK_ID, message: 'Draw it my way.' })
  })

  it('distinguishes a queued request from a delivered one', async () => {
    const deps = makeDeps(receipt('queued'))

    await expect(requestDiagram(deps, { taskId: TASK_ID, projectId: PROJECT_ID }))
      .resolves.toEqual({ status: 'queued' })
  })

  it('reports a task with no live session by its reason', async () => {
    const deps = makeDeps(vi.fn(async () => {
      throw new TaskFollowUpError('NO_SESSION', 'no session')
    }))

    await expect(requestDiagram(deps, { taskId: TASK_ID, projectId: PROJECT_ID }))
      .resolves.toMatchObject({ status: 'failed', reason: 'NO_SESSION' })
  })

  it('reports a rejected delivery by its reason', async () => {
    const deps = makeDeps(vi.fn(async () => {
      throw new TaskFollowUpError('DELIVERY_FAILED', 'write failed')
    }))

    await expect(requestDiagram(deps, { taskId: TASK_ID, projectId: PROJECT_ID }))
      .resolves.toMatchObject({ status: 'failed', reason: 'DELIVERY_FAILED' })
  })
})
