import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'

// Project-scoped plugin storage: a project is one repository's board, and plugin
// storage survives app restarts.
const COLLAPSED_COLUMNS_KEY = 'collapsedColumns'

/**
 * Which board columns the user collapsed, by column label ('' is the "No label /
 * Other" column). A stored label that is no longer a column stays stored, so the
 * column comes back collapsed if the label returns to the board.
 */
export function useIssuesCollapsedColumns(api: Pick<FrontendOpenForgeAPI, 'storage'>) {
  let projectId: string | null = null
  let activation = 0
  let collapsedLabels = $state<ReadonlySet<string>>(new Set())
  // Toggles made before the stored set arrives. They apply on top of the stored set,
  // so an early click is not lost and does not erase the other stored columns.
  let earlyChoices: Map<string, boolean> | null = null

  function persist(targetProjectId: string, labels: ReadonlySet<string>): void {
    api.storage
      .project(targetProjectId)
      .set<string[]>(COLLAPSED_COLUMNS_KEY, [...labels])
      .catch((cause: unknown) => {
        console.error('[issues] Failed to save collapsed columns.', cause)
      })
  }

  async function activateProject(nextProjectId: string | null): Promise<void> {
    projectId = nextProjectId
    activation += 1
    const current = activation
    collapsedLabels = new Set()
    earlyChoices = nextProjectId ? new Map() : null
    if (!nextProjectId) return

    let stored: string[] = []
    try {
      const value = await api.storage.project(nextProjectId).get<string[]>(COLLAPSED_COLUMNS_KEY)
      if (Array.isArray(value)) stored = value.filter((label) => typeof label === 'string')
    } catch (cause) {
      console.error('[issues] Failed to load collapsed columns.', cause)
    }
    if (current !== activation) return

    const choices = earlyChoices ?? new Map<string, boolean>()
    earlyChoices = null
    const next = new Set(stored)
    for (const [label, collapsed] of choices) {
      if (collapsed) next.add(label)
      else next.delete(label)
    }
    collapsedLabels = next
    if (choices.size > 0) persist(nextProjectId, next)
  }

  function toggle(label: string): void {
    const targetProjectId = projectId
    if (!targetProjectId) return

    const next = new Set(collapsedLabels)
    const collapsed = !next.has(label)
    if (collapsed) next.add(label)
    else next.delete(label)
    collapsedLabels = next

    if (earlyChoices) earlyChoices.set(label, collapsed)
    else persist(targetProjectId, next)
  }

  return {
    get collapsedLabels() {
      return collapsedLabels
    },
    activateProject,
    toggle,
  }
}

export type IssuesCollapsedColumns = ReturnType<typeof useIssuesCollapsedColumns>
