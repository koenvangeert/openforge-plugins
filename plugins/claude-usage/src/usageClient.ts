import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import type { SpendDashboardData, TaskSpendData } from './dashboard'

export interface RefreshResult {
  transcriptsSeen: number
  transcriptsRead: number
  transcriptsFailed: number
  responsesIndexed: number
  dashboard: SpendDashboardData
}

export async function fetchDashboard(api: FrontendOpenForgeAPI): Promise<SpendDashboardData> {
  await api.backend.whenReady()
  return api.backend.invoke<SpendDashboardData>('getDashboard', null)
}

export async function refreshDashboard(api: FrontendOpenForgeAPI): Promise<RefreshResult> {
  await api.backend.whenReady()
  return api.backend.invoke<RefreshResult>('refresh', null)
}

export async function fetchTaskSpend(api: FrontendOpenForgeAPI, taskId: string): Promise<TaskSpendData> {
  await api.backend.whenReady()
  return api.backend.invoke<TaskSpendData>('getTaskSpend', { taskId })
}
