import { describe, expect, it } from 'vitest'
import { attributeProject, attributeTask, buildAttributionMap } from './attribution'

const map = buildAttributionMap({
  projects: [
    { id: 'P-1', name: 'frontend', path: '/Users/dev/code/frontend' },
    { id: 'P-2', name: 'backend', path: '/Users/dev/code/backend' },
  ],
  tasks: [
    {
      id: 'T-1',
      title: 'Fix the flashing panel',
      projectId: 'P-1',
      workspacePath: '/Users/dev/.openforge/worktrees/frontend/KVG-1850',
    },
    {
      id: 'T-2',
      title: 'Nested in the checkout',
      projectId: 'P-1',
      workspacePath: '/Users/dev/code/frontend/worktrees/KVG-99',
    },
    { id: 'T-3', title: 'Runs in place', projectId: 'P-2', workspacePath: '/Users/dev/code/backend' },
  ],
  sessions: [
    { sessionId: 'session-a', taskId: 'T-1' },
    { sessionId: 'session-b', taskId: 'T-3' },
    { sessionId: 'session-c', taskId: 'T-gone' },
  ],
})

describe('attributeProject', () => {
  it('attributes a worktree outside every checkout to its task’s project', () => {
    expect(attributeProject(map, '/Users/dev/.openforge/worktrees/frontend/KVG-1850')).toEqual({
      kind: 'project',
      projectId: 'P-1',
      projectName: 'frontend',
    })
  })

  it('attributes a directory deeper inside a worktree, since agents record nested paths', () => {
    expect(
      attributeProject(map, '/Users/dev/.openforge/worktrees/frontend/KVG-1850/packages/ui'),
    ).toMatchObject({ projectId: 'P-1' })
  })

  it('attributes a project checkout', () => {
    expect(attributeProject(map, '/Users/dev/code/backend')).toEqual({
      kind: 'project',
      projectId: 'P-2',
      projectName: 'backend',
    })
  })

  it('reports a directory outside every project as unattributed rather than guessing', () => {
    expect(attributeProject(map, '/Users/dev/scratch')).toEqual({ kind: 'unattributed' })
  })

  it('does not let a shared path prefix attribute a sibling directory', () => {
    expect(attributeProject(map, '/Users/dev/code/frontend-experiments')).toEqual({ kind: 'unattributed' })
  })
})

describe('attributeTask', () => {
  it('names the task that recorded the session', () => {
    expect(attributeTask(map, 'session-a')).toEqual({
      taskId: 'T-1',
      taskTitle: 'Fix the flashing panel',
      projectId: 'P-1',
      projectName: 'frontend',
    })
  })

  it('names the in-place task whose directory is its project’s own', () => {
    expect(attributeTask(map, 'session-b')).toMatchObject({ taskId: 'T-3' })
  })

  it('claims nothing for a session the host does not know', () => {
    expect(attributeTask(map, 'session-unknown')).toBeNull()
  })

  it('claims nothing for a transcript that names no session', () => {
    expect(attributeTask(map, null)).toBeNull()
  })

  it('claims nothing for a session whose task is gone', () => {
    expect(attributeTask(map, 'session-c')).toBeNull()
  })
})
