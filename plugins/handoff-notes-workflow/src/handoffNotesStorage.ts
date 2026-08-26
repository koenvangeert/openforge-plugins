import type { PluginStorage } from '@openforge-app/plugin-sdk'

export const HANDOFF_NOTES_STORAGE_KEY = 'handoff-notes'
export const HANDOFF_NOTES_UPDATED_EVENT = 'handoff-notes.updated'

export interface HandoffNotesUpdatedEvent {
  taskId: string
}

export async function loadStoredHandoffNotes(
  storage: PluginStorage,
  taskId: string,
): Promise<string> {
  const notes = await storage.task(taskId).get<string>(HANDOFF_NOTES_STORAGE_KEY)
  return typeof notes === 'string' ? notes : ''
}

export async function saveStoredHandoffNotes(
  storage: PluginStorage,
  taskId: string,
  notes: string,
): Promise<string> {
  const normalizedNotes = notes.trim()
  await storage.task(taskId).set(HANDOFF_NOTES_STORAGE_KEY, normalizedNotes)
  return normalizedNotes
}
