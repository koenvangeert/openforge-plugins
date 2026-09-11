import { describe, expect, it } from 'vitest'
import { buildSeededTask, buildTaskDetail, FIXTURE_PROJECT_ID } from './tasks'

describe('TaskDetail fixture builder', () => {
  it('builds a Project of active Tasks with multiple labels, a cycle and an unlabelled Task', () => {
    const tasks = [
      buildTaskDetail({ id: 'T-1', title: 'Rotate the tokens', status: 'doing', labels: ['auth', 'api'] }),
      buildTaskDetail({ id: 'T-2', labels: ['api'], dependsOn: ['T-3'] }),
      buildTaskDetail({ id: 'T-3', labels: ['api'], dependsOn: ['T-2'] }),
      buildTaskDetail({ id: 'T-4' }),
    ]

    expect(tasks.every((task) => task.projectId === FIXTURE_PROJECT_ID)).toBe(true)
    expect(tasks[0].labels.map((label) => label.name)).toEqual(['auth', 'api'])
    expect(tasks[0].status).toBe('doing')
    expect([tasks[1].dependsOn, tasks[2].dependsOn]).toEqual([['T-3'], ['T-2']])
    expect(tasks[3].labels).toEqual([])
  })

  it('gives the same label name one id across Tasks', () => {
    const [carried] = buildTaskDetail({ id: 'T-5', labels: ['docs'] }).labels
    const [again] = buildTaskDetail({ id: 'T-6', labels: ['docs'] }).labels

    expect(carried).toEqual(again)
  })

  it('keeps an explicitly empty title empty', () => {
    expect(buildTaskDetail({ title: '' }).title).toBe('')
  })

  it('builds a seeded legacy row matching its TaskDetail', () => {
    const overrides = { id: 'T-7', title: 'Ship it', status: 'doing', dependsOn: ['T-8'] } as const
    const seeded = buildSeededTask(overrides)
    const detail = buildTaskDetail(overrides)

    expect(seeded.id).toBe(detail.id)
    expect(seeded.project_id).toBe(detail.projectId)
    expect(seeded.status).toBe(detail.status)
    expect(seeded.title).toBe(detail.title)
    expect(seeded.depends_on).toEqual(detail.dependsOn)
  })
})
