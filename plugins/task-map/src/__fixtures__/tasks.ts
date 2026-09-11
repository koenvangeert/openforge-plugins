import type { BoardStatus, Task, TaskDetail, TaskLabel } from '@openforge-app/plugin-sdk/domain'

export const FIXTURE_PROJECT_ID = 'P-1'

export interface TaskDetailOverrides {
  id?: string
  projectId?: string
  title?: string
  status?: BoardStatus
  labels?: readonly string[]
  dependsOn?: readonly string[]
}

const labelIds = new Map<string, number>()

function taskLabel(projectId: string, name: string): TaskLabel {
  const known = labelIds.get(name)
  const id = known ?? labelIds.size + 1
  if (known === undefined) labelIds.set(name, id)
  return { id, projectId, name }
}

export interface LabelAssignment {
  taskId: string
  labels: TaskLabel[]
}

export function buildLabelAssignment(taskId: string, ...names: string[]): LabelAssignment {
  return { taskId, labels: names.map((name) => taskLabel(FIXTURE_PROJECT_ID, name)) }
}

export function buildTaskDetail(overrides: TaskDetailOverrides = {}): TaskDetail {
  const id = overrides.id ?? 'T-1'
  const projectId = overrides.projectId ?? FIXTURE_PROJECT_ID
  return {
    id,
    projectId,
    status: overrides.status ?? 'backlog',
    title: overrides.title ?? `Task ${id}`,
    dependsOn: [...(overrides.dependsOn ?? [])],
    createdAt: 0,
    updatedAt: 0,
    promptPreview: '',
    labels: (overrides.labels ?? []).map((name) => taskLabel(projectId, name)),
    sourceTicketUrl: null,
    prompt: '',
    agent: null,
    permissionMode: null,
    worktreeSource: null,
    worktreeBranch: null,
    titleSource: null,
    titleGeneratedAt: null,
  }
}

export function buildSeededTask(overrides: TaskDetailOverrides = {}): Task {
  const id = overrides.id ?? 'T-1'
  return {
    id,
    project_id: overrides.projectId ?? FIXTURE_PROJECT_ID,
    status: overrides.status ?? 'backlog',
    title: overrides.title ?? `Task ${id}`,
    initial_prompt: '',
    prompt: null,
    title_source: null,
    title_generated_at: null,
    agent: null,
    permission_mode: null,
    worktree_source: null,
    worktree_branch: null,
    source_ticket_url: null,
    depends_on: [...(overrides.dependsOn ?? [])],
    created_at: 0,
    updated_at: 0,
  }
}
