// Filter selections for the current OpenForge process.
// The map lives in this module, so it survives leaving the Issues page and dies
// when OpenForge quits. It is not plugin storage, and it is not kept per reload
// of this module.

import type { DependencyMode } from './dependency'
import type { TaskAssociationMode } from './taskAssociation'

/** One chosen value chip. `'none'` is the "No value" chip. */
export type IssuesFilterValue = number | 'none'

/** The task, dependency, and value selections for one project. */
export interface IssuesFilterSelection {
  taskMode: TaskAssociationMode
  dependencyMode: DependencyMode
  values: IssuesFilterValue[]
}

const selections = new Map<string, IssuesFilterSelection>()

function emptySelection(): IssuesFilterSelection {
  return { taskMode: 'all', dependencyMode: 'all', values: [] }
}

/** The selection stored for `projectId`, or the default when nothing is stored. */
export function readIssuesFilterSelection(projectId: string | null): IssuesFilterSelection {
  const stored = projectId ? selections.get(projectId) : undefined
  if (!stored) return emptySelection()
  return {
    taskMode: stored.taskMode,
    dependencyMode: stored.dependencyMode,
    values: [...stored.values],
  }
}

/**
 * Merge `patch` into the selection for `projectId`. A missing project id is
 * ignored. Each field is replaced only when the patch carries that field, so
 * the task, dependency, and value controls can save independently.
 */
export function updateIssuesFilterSelection(
  projectId: string | null,
  patch: Partial<IssuesFilterSelection>,
): void {
  if (!projectId) return
  const current = readIssuesFilterSelection(projectId)
  selections.set(projectId, {
    taskMode: patch.taskMode ?? current.taskMode,
    dependencyMode: patch.dependencyMode ?? current.dependencyMode,
    values: patch.values !== undefined ? [...patch.values] : [...current.values],
  })
}

/** Drop every stored selection. Tests use this between cases. */
export function clearIssuesFilterSession(): void {
  selections.clear()
}
