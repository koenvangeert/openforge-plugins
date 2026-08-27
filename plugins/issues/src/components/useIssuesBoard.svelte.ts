import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import {
  applyCreate,
  applyRelabel,
  applyRename,
  emptyHierarchy,
  type BoardCard,
  type BoardModel,
} from '../lib/board'
import {
  modelFromIssuesBoard,
  patchBoardCardValue,
  patchBoardLabelColor,
  reconcilePendingCreatedCards,
} from '../lib/boardModel'
import { normalizeLabelColor } from '../lib/labelColors'
import { loadIssueTaskLinks, startIssueAction } from '../lib/issueActions'
import { createIssuesClient } from '../lib/issuesClient'
import type { RefineTicketRequest, RepoLabel, IssuesConfig, TicketDraft } from '../lib/types'

function errorMessage(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
}

export function useIssuesBoard(api: FrontendOpenForgeAPI) {
  // `api` is stable for the plugin view lifetime, so the backend client is intentionally captured once.
  const client = createIssuesClient(api)

  let activeProjectId = $state<string | null | undefined>(undefined)
  let projectActivation = 0
  let board = $state<BoardModel | null>(null)
  let repoLabels = $state<RepoLabel[]>([])
  let isLoading = $state(false)
  let error = $state<string | null>(null)
  let busy = $state(false)
  let pendingCreatedCards = $state<BoardCard[]>([])

  function isCurrentActivation(
    projectId: string | null | undefined,
    activation: number,
  ): boolean {
    return activeProjectId === projectId && projectActivation === activation
  }

  async function loadBoard(): Promise<void> {
    const projectId = activeProjectId
    const activation = projectActivation
    if (!projectId) {
      board = null
      return
    }

    isLoading = true
    error = null
    try {
      const raw = await client.getBoard(projectId)
      const taskLinks = await loadIssueTaskLinks(api, projectId)
      if (!isCurrentActivation(projectId, activation)) return

      const reconciliation = reconcilePendingCreatedCards(
        modelFromIssuesBoard(raw, taskLinks),
        raw,
        pendingCreatedCards,
      )
      repoLabels = raw.labels
      pendingCreatedCards = reconciliation.pendingCards
      board = reconciliation.board
    } catch (cause) {
      if (!isCurrentActivation(projectId, activation)) return
      board = null
      error = errorMessage(cause)
    } finally {
      if (isCurrentActivation(projectId, activation)) isLoading = false
    }
  }

  // Returns true only for a logical project change. Callers use this to reset view-local
  // drawers/dialogs without relying on effect cleanup, which can run for prop identity churn.
  function activateProject(projectId: string | null): boolean {
    if (projectId === activeProjectId) return false

    activeProjectId = projectId
    projectActivation += 1
    board = null
    repoLabels = []
    pendingCreatedCards = []
    error = null
    busy = false
    isLoading = false
    void loadBoard()
    return true
  }

  async function withBusy(operation: () => Promise<void>): Promise<boolean> {
    const projectId = activeProjectId
    const activation = projectActivation
    error = null
    busy = true
    try {
      await operation()
      return isCurrentActivation(projectId, activation)
    } catch (cause) {
      if (isCurrentActivation(projectId, activation)) error = errorMessage(cause)
      return false
    } finally {
      if (isCurrentActivation(projectId, activation)) busy = false
    }
  }

  async function setValue(issueNumber: number, value: number | null): Promise<void> {
    const projectId = activeProjectId
    if (!projectId || !board) return

    board = patchBoardCardValue(board, issueNumber, value)
    await withBusy(async () => {
      await client.setValue({ projectId, issueNumber, value })
    })
  }

  async function saveText(issueNumber: number, title: string, body: string): Promise<boolean> {
    const projectId = activeProjectId
    const activation = projectActivation
    if (!projectId || !board) return false

    if (title) board = applyRename(board, issueNumber, title)
    return withBusy(async () => {
      await client.editIssue({ projectId, number: issueNumber, title, body })
      if (isCurrentActivation(projectId, activation)) await loadBoard()
    })
  }

  async function toggleLabel(
    issueNumber: number,
    name: string,
    currentlyOn: boolean,
  ): Promise<void> {
    const projectId = activeProjectId
    const activation = projectActivation
    if (!projectId || !board) return

    board = currentlyOn
      ? applyRelabel(board, issueNumber, name, '')
      : applyRelabel(board, issueNumber, '', name)
    await withBusy(async () => {
      await client.editIssue({
        projectId,
        number: issueNumber,
        addLabels: currentlyOn ? [] : [name],
        removeLabels: currentlyOn ? [name] : [],
      })
      if (isCurrentActivation(projectId, activation)) await loadBoard()
    })
  }

  /**
   * Move a card from one column to another by dragging: remove `fromLabel`, add
   * `toLabel` (either may be '' for the "no curated label" / Other column). A
   * same-column drop is a no-op. Manual ordering within a column isn't part of this
   * board (cards sort by value/issue number, see lib/board.ts), so this only ever
   * changes which column a card belongs to.
   */
  async function moveCard(issueNumber: number, fromLabel: string, toLabel: string): Promise<void> {
    const projectId = activeProjectId
    const activation = projectActivation
    if (!projectId || !board || fromLabel === toLabel) return

    board = applyRelabel(board, issueNumber, fromLabel, toLabel)
    await withBusy(async () => {
      await client.editIssue({
        projectId,
        number: issueNumber,
        addLabels: toLabel ? [toLabel] : [],
        removeLabels: fromLabel ? [fromLabel] : [],
      })
      if (isCurrentActivation(projectId, activation)) await loadBoard()
    })
  }

  async function closeIssue(issueNumber: number): Promise<boolean> {
    const projectId = activeProjectId
    if (!projectId) return false

    return withBusy(async () => {
      await client.editIssue({ projectId, number: issueNumber, state: 'closed' })
    })
  }

  async function createIssue(title: string, body: string, labels: string[]): Promise<boolean> {
    const projectId = activeProjectId
    const activation = projectActivation
    if (!projectId || !board) return false

    return withBusy(async () => {
      const issue = await client.createIssue({ projectId, title, body, labels })
      if (!isCurrentActivation(projectId, activation)) return
      const newCard: BoardCard = {
        issueNumber: issue.number,
        title: issue.title,
        body: issue.body,
        labels: issue.labels.map((label) => label.name),
        value: null,
        taskLink: null,
        ...emptyHierarchy(),
      }
      pendingCreatedCards = [
        ...pendingCreatedCards.filter((card) => card.issueNumber !== newCard.issueNumber),
        newCard,
      ]
      if (board) board = applyCreate(board, newCard)
      // Do not immediately refetch: GitHub's issue listing is eventually consistent.
      // A later refresh reconciles pending cards once the listing includes the issue.
    })
  }

  async function refineTicketDraft(
    request: Omit<RefineTicketRequest, 'projectId' | 'repo' | 'repoLabels'>,
  ): Promise<TicketDraft> {
    const projectId = activeProjectId
    const activation = projectActivation
    if (!projectId) throw new Error('Select a project before refining a ticket.')

    try {
      return await client.refineTicket({
        projectId,
        repo: board?.repo ?? '',
        repoLabels: repoLabels.map((label) => label.name),
        ...request,
      })
    } catch (cause) {
      if (isCurrentActivation(projectId, activation)) error = errorMessage(cause)
      throw cause
    }
  }

  async function runIssueAction(card: BoardCard): Promise<void> {
    const projectId = activeProjectId
    const activation = projectActivation
    const repo = board?.repo
    if (!projectId || !repo) return

    await withBusy(async () => {
      await startIssueAction(api, { projectId, repo, card })
      if (isCurrentActivation(projectId, activation)) await loadBoard()
    })
  }

  function patchRepoLabelColor(name: string, color: string): void {
    repoLabels = repoLabels.map((label) =>
      label.name === name ? { ...label, color } : label,
    )
    if (board) board = patchBoardLabelColor(board, name, color)
  }

  async function recolorLabel(name: string, rawColor: string): Promise<void> {
    const projectId = activeProjectId
    const activation = projectActivation
    if (!projectId) return

    const color = normalizeLabelColor(rawColor)
    if (!color) {
      error = 'Label color must be a six-digit hex color.'
      return
    }

    const previousBoard = board
    const previousRepoLabels = repoLabels
    patchRepoLabelColor(name, color)
    busy = true
    try {
      await client.updateLabelColor({ projectId, name, color })
      if (isCurrentActivation(projectId, activation)) await loadBoard()
    } catch (cause) {
      if (isCurrentActivation(projectId, activation)) {
        board = previousBoard
        repoLabels = previousRepoLabels
        error = errorMessage(cause)
      }
      throw cause
    } finally {
      if (isCurrentActivation(projectId, activation)) busy = false
    }
  }

  async function loadColumnConfig(): Promise<IssuesConfig | null> {
    const projectId = activeProjectId
    const activation = projectActivation
    if (!projectId) return null

    error = null
    try {
      const config = await client.getConfig(projectId)
      return isCurrentActivation(projectId, activation) ? config : null
    } catch (cause) {
      if (isCurrentActivation(projectId, activation)) error = errorMessage(cause)
      return null
    }
  }

  async function saveColumns(labels: string[]): Promise<boolean> {
    const projectId = activeProjectId
    const activation = projectActivation
    if (!projectId) return false

    return withBusy(async () => {
      await client.setColumnLabels({ projectId, labels })
      if (isCurrentActivation(projectId, activation)) await loadBoard()
    })
  }

  function clearError(): void {
    error = null
  }

  return {
    get board() {
      return board
    },
    get repoLabels() {
      return repoLabels
    },
    get repoSlug() {
      return board?.repo ?? ''
    },
    get isLoading() {
      return isLoading
    },
    get error() {
      return error
    },
    get busy() {
      return busy
    },
    activateProject,
    loadBoard,
    setValue,
    saveText,
    toggleLabel,
    moveCard,
    closeIssue,
    createIssue,
    refineTicketDraft,
    runIssueAction,
    recolorLabel,
    loadColumnConfig,
    saveColumns,
    clearError,
  }
}

export type IssuesBoardController = ReturnType<typeof useIssuesBoard>
