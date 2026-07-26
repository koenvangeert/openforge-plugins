import type { ImplementationRun, JsonObject } from '@openforge-app/plugin-sdk'
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
    return {}
  }
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
  run: ImplementationRun,
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

export function buildIssueTaskPrompt({ repo, card }: BuildIssueTaskPromptRequest): string {
  const lines = [
    `Implement this GitHub issue #${card.issueNumber}: ${card.title}`,
    '',
    `Repository: ${repo}`,
    `Issue URL: https://github.com/${repo}/issues/${card.issueNumber}`,
  ]

  if (card.labels.length > 0) {
    lines.push(`Labels: ${card.labels.join(', ')}`)
  }

  if (card.value !== null) {
    lines.push(`Value: ${card.value}`)
  }

  const body = card.body?.trim()
  if (body) {
    lines.push('', 'Issue body:', body)
  }

  return lines.join('\n')
}

export async function startIssueAction(
  api: FrontendOpenForgeAPI,
  request: StartIssueActionRequest,
): Promise<ImplementationRun> {
  const task = await api.tasks.create({
    projectId: request.projectId,
    initialPrompt: buildIssueTaskPrompt({
      repo: request.repo,
      card: request.card,
    }),
  })

  const run = await api.tasks.startImplementation({ taskId: task.id })
  await saveIssueTaskLink(api, request.projectId, request.card.issueNumber, run, request.repo, request.card.title)
  await api.navigation.navigate({ projectId: request.projectId, viewId: 'board', taskId: task.id })
  return run
}
