import { describe, expect, it } from 'vitest'
import { attribute, attributionKey, buildAttributionMap } from './attribution'

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
  ],
})

describe('attribute', () => {
  it('attributes a worktree directory to its task and that task’s project', () => {
    expect(attribute(map, '/Users/dev/.openforge/worktrees/frontend/KVG-1850')).toEqual({
      kind: 'task',
      taskId: 'T-1',
      taskTitle: 'Fix the flashing panel',
      projectId: 'P-1',
      projectName: 'frontend',
    })
  })

  it('attributes a directory deeper inside a worktree, since agents record nested paths', () => {
    expect(attribute(map, '/Users/dev/.openforge/worktrees/frontend/KVG-1850/packages/ui')).toMatchObject({
      taskId: 'T-1',
    })
  })

  it('prefers the task over the project when the worktree sits inside the checkout', () => {
    expect(attribute(map, '/Users/dev/code/frontend/worktrees/KVG-99/src')).toMatchObject({ taskId: 'T-2' })
  })

  it('attributes a project checkout with no task', () => {
    expect(attribute(map, '/Users/dev/code/backend')).toEqual({
      kind: 'project',
      projectId: 'P-2',
      projectName: 'backend',
    })
  })

  it('reports a directory outside every project as unattributed rather than guessing', () => {
    expect(attribute(map, '/Users/dev/scratch')).toEqual({ kind: 'unattributed' })
  })

  it('does not let a shared path prefix attribute a sibling directory', () => {
    expect(attribute(map, '/Users/dev/code/frontend-experiments')).toEqual({ kind: 'unattributed' })
  })
})

describe('attributionKey', () => {
  it('keeps task and project scopes in distinct namespaces', () => {
    expect(attributionKey({ kind: 'task', taskId: 'P-1', taskTitle: 't', projectId: 'P-1', projectName: 'p' })).not.toBe(
      attributionKey({ kind: 'project', projectId: 'P-1', projectName: 'p' }),
    )
  })
})
