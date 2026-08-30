import type { ComposeTaskResult, JsonObject } from '@openforge-app/plugin-sdk'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import type { BoardCard, IssueTaskLink } from './board'

interface StartIssueActionRequest {
  projectId: string
  repo: string
  card: BoardCard
}

interface BuildIssueTaskPromptRequest {
  repo: string
  card: BoardCard
}

export interface TaskIssueLink {
  issueNumber: number
  link: IssueTaskLink
}

const ISSUE_TASK_LINKS_KEY = 'issueTaskLinks'
const TASK_ISSUE_LINK_KEY = 'issueTaskLink'
// Project storage has no atomic update operation, so serialize each project's read/merge/write cycle.
const issueTaskLinkUpdates = new Map<string, Promise<void>>()

function isIssueTaskLink(value: unknown): value is IssueTaskLink {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.taskId === 'string' &&
    typeof candidate.sessionId === 'string' &&
    typeof candidate.workspacePath === 'string'
  )
}

function normalizeIssueTaskLink(value: IssueTaskLink): IssueTaskLink {
  return {
    taskId: value.taskId,
    sessionId: value.sessionId,
    workspacePath: value.workspacePath,
    repo: typeof (value as { repo?: unknown }).repo === 'string' ? (value as { repo: string }).repo : null,
    title: typeof (value as { title?: unknown }).title === 'string' ? (value as { title: string }).title : null,
  }
}

function serializeIssueTaskLink(link: IssueTaskLink): JsonObject {
  return {
    taskId: link.taskId,
    sessionId: link.sessionId,
    workspacePath: link.workspacePath,
    repo: link.repo,
    title: link.title,
  }
}

function isTaskIssueLink(value: unknown): value is TaskIssueLink {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.issueNumber === 'number' && Number.isInteger(candidate.issueNumber) && isIssueTaskLink(candidate.link)
}

function parseStoredIssueTaskLinks(value: unknown): Record<number, IssueTaskLink> {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}

  const links: Record<number, IssueTaskLink> = {}
  for (const [issueNumber, link] of Object.entries(parsed)) {
    const issue = Number(issueNumber)
    if (Number.isInteger(issue) && issue > 0 && isIssueTaskLink(link)) {
      links[issue] = normalizeIssueTaskLink(link)
    }
  }
  return links
}

async function readIssueTaskLinks(
  api: FrontendOpenForgeAPI,
  projectId: string,
): Promise<Record<number, IssueTaskLink>> {
  const stored = await api.storage.project(projectId).get(ISSUE_TASK_LINKS_KEY)
  return parseStoredIssueTaskLinks(stored)
}

export async function loadIssueTaskLinks(
  api: FrontendOpenForgeAPI,
  projectId: string | null,
): Promise<Record<number, IssueTaskLink>> {
  if (!projectId) return {}
  try {
    return await readIssueTaskLinks(api, projectId)
  } catch {
    // The board reloads this right as the plugin (re)activates -- e.g. right after a
    // reload or a disable/enable cycle -- so a failure here is more likely a transient
    // hiccup in the freshly (re)connected storage bridge than a real absence of data.
    // One retry rides that out. Swallowing it outright used to render exactly like every
    // task chip had disappeared, with nothing in the console to tell the two apart, so a
    // failure that survives the retry is still reported -- just not thrown, since callers
    // (the board) treat "no links yet" as a normal, unscored state.
    try {
      return await readIssueTaskLinks(api, projectId)
    } catch (secondError) {
      console.error(
        `[issues] Failed to load issue-task links for project ${projectId} after a retry. Task chips on this board may be missing until the next successful load.`,
        secondError,
      )
      return {}
    }
  }
}

/**
 * Complete and Delete remove a Task from every board surface. Plugin storage
 * still holds the issue link, so the board must drop links whose Task is no
 * longer in the live project list.
 */
export function keepLiveIssueTaskLinks(
  links: Record<number, IssueTaskLink>,
  liveTaskIds: Iterable<string>,
): Record<number, IssueTaskLink> {
  const live = liveTaskIds instanceof Set ? liveTaskIds : new Set(liveTaskIds)
  const kept: Record<number, IssueTaskLink> = {}
  for (const [issueNumber, link] of Object.entries(links)) {
    if (live.has(link.taskId)) kept[Number(issueNumber)] = link
  }
  return kept
}

async function loadLiveTaskIds(
  api: FrontendOpenForgeAPI,
  projectId: string,
): Promise<Set<string> | null> {
  try {
    const tasks = await api.tasks.list({ projectId })
    return new Set(tasks.map((task) => task.id))
  } catch {
    return null
  }
}

export async function loadVisibleIssueTaskLinks(
  api: FrontendOpenForgeAPI,
  projectId: string | null,
): Promise<Record<number, IssueTaskLink>> {
  const stored = await loadIssueTaskLinks(api, projectId)
  if (!projectId) return stored
  const liveTaskIds = await loadLiveTaskIds(api, projectId)
  if (liveTaskIds === null) return stored
  return keepLiveIssueTaskLinks(stored, liveTaskIds)
}

export function findIssueTaskLinkForTask(
  links: Record<number, IssueTaskLink>,
  taskId: string,
): { issueNumber: number; link: IssueTaskLink } | null {
  for (const [issueNumber, link] of Object.entries(links)) {
    if (link.taskId === taskId) return { issueNumber: Number(issueNumber), link }
  }
  return null
}

function parseStoredTaskIssueLink(value: unknown): TaskIssueLink | null {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  if (!isTaskIssueLink(parsed) || parsed.issueNumber <= 0) return null
  return { issueNumber: parsed.issueNumber, link: normalizeIssueTaskLink(parsed.link) }
}

export async function loadIssueTaskLinkForTask(
  api: FrontendOpenForgeAPI,
  projectId: string | null,
  taskId: string,
): Promise<TaskIssueLink | null> {
  try {
    const stored = await api.storage.task(taskId).get(TASK_ISSUE_LINK_KEY)
    const taskLink = parseStoredTaskIssueLink(stored)
    if (taskLink) return taskLink
  } catch {
    // Fall back to the legacy project map below.
  }

  if (!projectId) return null
  const projectLinks = await loadIssueTaskLinks(api, projectId)
  return findIssueTaskLinkForTask(projectLinks, taskId)
}

async function updateIssueTaskLinks(
  api: FrontendOpenForgeAPI,
  projectId: string,
  issueNumber: number,
  link: IssueTaskLink,
): Promise<void> {
  const previousUpdate = issueTaskLinkUpdates.get(projectId) ?? Promise.resolve()
  const update = previousUpdate.catch(() => undefined).then(async () => {
    const links = await readIssueTaskLinks(api, projectId)
    links[issueNumber] = link

    const stored: JsonObject = {}
    for (const [issue, storedLink] of Object.entries(links)) {
      stored[issue] = serializeIssueTaskLink(storedLink)
    }
    await api.storage.project(projectId).set(ISSUE_TASK_LINKS_KEY, stored)
  })

  issueTaskLinkUpdates.set(projectId, update)
  try {
    await update
  } finally {
    if (issueTaskLinkUpdates.get(projectId) === update) {
      issueTaskLinkUpdates.delete(projectId)
    }
  }
}

async function saveIssueTaskLink(
  api: FrontendOpenForgeAPI,
  projectId: string,
  issueNumber: number,
  // Session id and workspace path are unknown while the task is only composed;
  // they are filled in once the task actually runs.
  run: { taskId: string; sessionId: string; workspacePath: string },
  repo: string,
  title: string,
): Promise<void> {
  const link: IssueTaskLink = {
    taskId: run.taskId,
    sessionId: run.sessionId,
    workspacePath: run.workspacePath,
    repo,
    title,
  }
  await api.storage.task(run.taskId).set(TASK_ISSUE_LINK_KEY, {
    issueNumber,
    link: serializeIssueTaskLink(link),
  })
  await updateIssueTaskLinks(api, projectId, issueNumber, link)
}

export function issueUrl({ repo, card }: BuildIssueTaskPromptRequest): string {
  return `https://github.com/${repo}/issues/${card.issueNumber}`
}

/**
 * A reference, not a copy. The agent reads the issue itself when it needs the
 * body, so it sees the issue as it stands rather than as it was when the menu
 * was clicked — and the create dialog stays short enough to read and edit.
 */
export function buildIssueTaskPrompt({ repo, card }: BuildIssueTaskPromptRequest): string {
  return [
    `Implement GitHub issue #${card.issueNumber}: ${card.title}`,
    '',
    issueUrl({ repo, card }),
  ].join('\n')
}

/**
 * Hands the issue to the host's create-task dialog, pre-filled, instead of
 * creating and starting a task behind the user's back. The dialog carries the
 * injectable picker and the task's workspace/permission settings, and the user
 * decides there whether to start now.
 */
export async function startIssueAction(
  api: FrontendOpenForgeAPI,
  request: StartIssueActionRequest,
): Promise<ComposeTaskResult | null> {
  const url = issueUrl({ repo: request.repo, card: request.card })

  const result = await api.tasks.compose({
    projectId: request.projectId,
    initialPrompt: buildIssueTaskPrompt({ repo: request.repo, card: request.card }),
    sourceTicketUrl: url,
    title: request.card.title,
  })

  // Dismissed: no task was created, so there is nothing to link.
  if (!result) return null

  await saveIssueTaskLink(
    api,
    request.projectId,
    request.card.issueNumber,
    { taskId: result.task.id, sessionId: '', workspacePath: '' },
    request.repo,
    request.card.title,
  )

  // No navigation here: the host moves to the board itself when the user starts
  // the task, and on a plain create they stay on the issues board.
  return result
}
