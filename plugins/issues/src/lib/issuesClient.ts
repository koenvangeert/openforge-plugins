import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import type {
  CreateIssueRequest,
  EditIssueRequest,
  RefineTicketRequest,
  IssuesBoard,
  IssuesConfig,
  Issue,
  TicketDraft,
  UpdateLabelColorRequest,
} from './types'

export interface IssuesClient {
  getBoard(projectId: string): Promise<IssuesBoard>
  setValue(request: { projectId: string; issueNumber: number; value: number | null }): Promise<void>
  getConfig(projectId: string): Promise<IssuesConfig>
  setColumnLabels(request: { projectId: string; labels: string[] }): Promise<void>
  createIssue(request: CreateIssueRequest): Promise<Issue>
  editIssue(request: EditIssueRequest): Promise<void>
  updateLabelColor(request: UpdateLabelColorRequest): Promise<void>
  refineTicket(request: RefineTicketRequest): Promise<TicketDraft>
}

async function invokeBackend<TOutput>(
  api: Pick<FrontendOpenForgeAPI, 'backend'>,
  method: string,
  payload?: unknown,
): Promise<TOutput> {
  await api.backend.whenReady()
  return api.backend.invoke<TOutput>(method, payload)
}

export function createIssuesClient(api: Pick<FrontendOpenForgeAPI, 'backend'>): IssuesClient {
  return {
    getBoard: (projectId) => invokeBackend<IssuesBoard>(api, 'issues_get_board', { projectId }),
    setValue: ({ projectId, issueNumber, value }) =>
      invokeBackend<void>(api, 'issues_set_value', { projectId, issueNumber, value }),
    getConfig: (projectId) => invokeBackend<IssuesConfig>(api, 'issues_get_config', { projectId }),
    setColumnLabels: ({ projectId, labels }) =>
      invokeBackend<void>(api, 'issues_set_column_labels', { projectId, labels }),
    createIssue: (request) =>
      invokeBackend<{ issue: Issue }>(api, 'issues_create_issue', request).then((r) => r.issue),
    editIssue: (request) => invokeBackend<void>(api, 'issues_edit_issue', request),
    updateLabelColor: (request) => invokeBackend<void>(api, 'issues_update_label_color', request),
    refineTicket: (request) => invokeBackend<TicketDraft>(api, 'issues_refine_ticket', request),
  }
}
