import type { LabelUsage } from '../lib/types'
import type { IssuesBoardController } from './useIssuesBoard.svelte'

export function useIssuesColumnSettings(issues: IssuesBoardController) {
  let open = $state(false)
  let labels = $state<LabelUsage[]>([])
  let columnLabels = $state<string[]>([])

  async function show(): Promise<void> {
    const config = await issues.loadColumnConfig()
    if (!config) return

    labels = config.labels
    columnLabels = config.columnLabels
    open = true
  }

  function close(): void {
    open = false
    issues.clearError()
  }

  async function save(nextColumnLabels: string[]): Promise<void> {
    if (await issues.saveColumns(nextColumnLabels)) open = false
  }

  return {
    get open() {
      return open
    },
    get labels() {
      return labels
    },
    get columnLabels() {
      return columnLabels
    },
    show,
    close,
    save,
  }
}

export type IssuesColumnSettingsController = ReturnType<typeof useIssuesColumnSettings>
