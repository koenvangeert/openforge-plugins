export interface AttributionSource {
  projects: Array<{ id: string; name: string; path: string }>
  tasks: Array<{ id: string; title: string; projectId: string; workspacePath: string }>
  sessions: Array<{ sessionId: string; taskId: string }>
}

export interface TaskAttribution {
  taskId: string
  taskTitle: string
  projectId: string
  projectName: string
}

export type ProjectAttribution =
  | { kind: 'project'; projectId: string; projectName: string }
  | { kind: 'unattributed' }

interface DirectoryEntry {
  path: string
  projectId: string
  projectName: string
}

export interface AttributionMap {
  directories: readonly DirectoryEntry[]
  tasksBySession: ReadonlyMap<string, TaskAttribution>
}

function normalizePath(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

/**
 * Task workspaces join the directory list because most of them are worktrees
 * that live outside every Project checkout, and dropping them would strand
 * their spend as unattributed. Longest path first, so a worktree nested inside
 * a checkout resolves through its own Task.
 */
export function buildAttributionMap(source: AttributionSource): AttributionMap {
  const projectNames = new Map(source.projects.map((project) => [project.id, project.name]))
  const nameOf = (projectId: string) => projectNames.get(projectId) ?? projectId
  const directories: DirectoryEntry[] = source.projects.map((project) => ({
    path: normalizePath(project.path),
    projectId: project.id,
    projectName: project.name,
  }))
  const tasksById = new Map<string, TaskAttribution>()
  for (const task of source.tasks) {
    directories.push({
      path: normalizePath(task.workspacePath),
      projectId: task.projectId,
      projectName: nameOf(task.projectId),
    })
    tasksById.set(task.id, {
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.projectId,
      projectName: nameOf(task.projectId),
    })
  }
  directories.sort((left, right) => right.path.length - left.path.length)

  const tasksBySession = new Map<string, TaskAttribution>()
  for (const session of source.sessions) {
    const task = tasksById.get(session.taskId)
    if (task) tasksBySession.set(session.sessionId, task)
  }
  return { directories, tasksBySession }
}

export function attributeProject(map: AttributionMap, cwd: string): ProjectAttribution {
  const target = normalizePath(cwd)
  for (const entry of map.directories) {
    if (target === entry.path || target.startsWith(`${entry.path}/`)) {
      return { kind: 'project', projectId: entry.projectId, projectName: entry.projectName }
    }
  }
  return { kind: 'unattributed' }
}

/**
 * A Task that runs in its Project checkout shares that directory with the
 * Project and with every other in-place Task, so only the session identity can
 * name the Task that spent the money.
 */
export function attributeTask(map: AttributionMap, sessionId: string | null): TaskAttribution | null {
  return sessionId === null ? null : (map.tasksBySession.get(sessionId) ?? null)
}
