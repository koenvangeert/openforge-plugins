export interface AttributionSource {
  projects: Array<{ id: string; name: string; path: string }>
  tasks: Array<{ id: string; title: string; projectId: string; workspacePath: string }>
}

export type Attribution =
  | { kind: 'task'; taskId: string; taskTitle: string; projectId: string; projectName: string }
  | { kind: 'project'; projectId: string; projectName: string }
  | { kind: 'unattributed' }

interface AttributionEntry {
  path: string
  attribution: Attribution
}

export interface AttributionMap {
  entries: readonly AttributionEntry[]
}

function normalizePath(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

/**
 * Longest path first, so a Task worktree nested inside a Project checkout wins
 * over the Project it belongs to.
 */
export function buildAttributionMap(source: AttributionSource): AttributionMap {
  const projectNames = new Map(source.projects.map((project) => [project.id, project.name]))
  const entries: AttributionEntry[] = []
  for (const project of source.projects) {
    entries.push({
      path: normalizePath(project.path),
      attribution: { kind: 'project', projectId: project.id, projectName: project.name },
    })
  }
  for (const task of source.tasks) {
    entries.push({
      path: normalizePath(task.workspacePath),
      attribution: {
        kind: 'task',
        taskId: task.id,
        taskTitle: task.title,
        projectId: task.projectId,
        projectName: projectNames.get(task.projectId) ?? task.projectId,
      },
    })
  }
  entries.sort((left, right) => right.path.length - left.path.length)
  return { entries }
}

export function attribute(map: AttributionMap, cwd: string): Attribution {
  const target = normalizePath(cwd)
  for (const entry of map.entries) {
    if (target === entry.path || target.startsWith(`${entry.path}/`)) return entry.attribution
  }
  return { kind: 'unattributed' }
}

export function attributionKey(attribution: Attribution): string {
  switch (attribution.kind) {
    case 'task':
      return `task:${attribution.taskId}`
    case 'project':
      return `project:${attribution.projectId}`
    case 'unattributed':
      return 'unattributed'
  }
}
