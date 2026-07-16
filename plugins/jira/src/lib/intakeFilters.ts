import type { JsonValue } from '@openforge-app/plugin-sdk'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { PROJECT_KEY } from './protocol'

type Api = Pick<FrontendOpenForgeAPI, 'storage'>

export interface IntakeFilter {
  id: string
  name: string
  jql: string
}

export interface IntakeFilters {
  filters: IntakeFilter[]
  activeFilterId: string
}

export const DEFAULT_INTAKE_FILTER: IntakeFilter = {
  id: 'default',
  name: 'My open issues',
  jql: 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC',
}

const DEFAULT_FILTERS: IntakeFilters = {
  filters: [DEFAULT_INTAKE_FILTER],
  activeFilterId: DEFAULT_INTAKE_FILTER.id,
}

function toJson(value: IntakeFilters): JsonValue {
  return value as unknown as JsonValue
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isIntakeFilter(value: unknown): value is IntakeFilter {
  return isRecord(value)
    && typeof value.id === 'string' && value.id.trim().length > 0
    && typeof value.name === 'string' && value.name.trim().length > 0
    && typeof value.jql === 'string' && value.jql.trim().length > 0
}

function normalizeIntakeFilters(raw: unknown): IntakeFilters {
  if (!isRecord(raw) || !Array.isArray(raw.filters)) return DEFAULT_FILTERS
  const filters = raw.filters.filter(isIntakeFilter)
  if (filters.length === 0 || new Set(filters.map(({ id }) => id)).size !== filters.length) return DEFAULT_FILTERS
  const activeFilterId = typeof raw.activeFilterId === 'string'
    && filters.some(({ id }) => id === raw.activeFilterId)
    ? raw.activeFilterId
    : filters[0].id
  return { filters, activeFilterId }
}

export async function readIntakeFilters(api: Api, projectId: string): Promise<IntakeFilters> {
  const store = api.storage.project(projectId)
  const raw = await store.get(PROJECT_KEY.intakeFilters)
  const filters = normalizeIntakeFilters(raw)
  if (JSON.stringify(raw) !== JSON.stringify(filters)) {
    await store.set(PROJECT_KEY.intakeFilters, toJson(filters))
  }
  return filters
}

async function writeIntakeFilters(api: Api, projectId: string, value: IntakeFilters): Promise<IntakeFilters> {
  await api.storage.project(projectId).set(PROJECT_KEY.intakeFilters, toJson(value))
  return value
}

export async function saveIntakeFilter(
  api: Api,
  projectId: string,
  filter: IntakeFilter,
): Promise<IntakeFilters> {
  if (!isIntakeFilter(filter)) throw new Error('Intake Filters require a non-empty id, name and JQL query.')
  const current = await readIntakeFilters(api, projectId)
  const existingIndex = current.filters.findIndex(({ id }) => id === filter.id)
  const filters = [...current.filters]
  if (existingIndex === -1) filters.push(filter)
  else filters[existingIndex] = filter
  return writeIntakeFilters(api, projectId, { filters, activeFilterId: current.activeFilterId })
}

export async function activateIntakeFilter(api: Api, projectId: string, filterId: string): Promise<IntakeFilters> {
  const current = await readIntakeFilters(api, projectId)
  if (!current.filters.some(({ id }) => id === filterId)) {
    throw new Error(`Intake Filter not found: ${filterId}`)
  }
  return writeIntakeFilters(api, projectId, { ...current, activeFilterId: filterId })
}

export async function deleteIntakeFilter(api: Api, projectId: string, filterId: string): Promise<IntakeFilters> {
  const current = await readIntakeFilters(api, projectId)
  const filters = current.filters.filter(({ id }) => id !== filterId)
  if (filters.length === 0) return writeIntakeFilters(api, projectId, DEFAULT_FILTERS)

  const activeFilterId = current.activeFilterId === filterId ? filters[0].id : current.activeFilterId
  return writeIntakeFilters(api, projectId, { filters, activeFilterId })
}
