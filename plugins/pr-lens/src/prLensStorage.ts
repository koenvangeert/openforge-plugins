import type { JsonObject, PluginStorage } from '@openforge-app/plugin-sdk'
import type { GraphDoc } from '@coldtea/pr-lens-schema'

export const DIAGRAM_STORAGE_KEY = 'diagram'
export const DIAGRAM_UPDATED_EVENT = 'pr-lens.diagram-updated'

export interface DiagramUpdatedEvent {
  taskId: string
}

export type WorkingTreeCleanliness = 'clean' | 'dirty'

export interface StoredDiagram {
  document: GraphDoc
  /** The Agent Session live when the document was written, used to date it. */
  sessionId: string | null
  storedAt: string
  /** Absent whenever the Agent did not say, which never means clean. */
  cleanliness: WorkingTreeCleanliness | null
}

export async function loadStoredDiagram(
  storage: PluginStorage,
  taskId: string,
): Promise<StoredDiagram | null> {
  const raw = await storage.task(taskId).get<JsonObject>(DIAGRAM_STORAGE_KEY)
  return isStoredDiagram(raw) ? raw : null
}

export async function saveStoredDiagram(
  storage: PluginStorage,
  taskId: string,
  diagram: StoredDiagram,
): Promise<StoredDiagram> {
  await storage.task(taskId).set(DIAGRAM_STORAGE_KEY, diagram as unknown as JsonObject)
  return diagram
}

function isStoredDiagram(value: unknown): value is StoredDiagram {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<StoredDiagram>
  return typeof candidate.document === 'object'
    && candidate.document !== null
    && typeof candidate.storedAt === 'string'
}
