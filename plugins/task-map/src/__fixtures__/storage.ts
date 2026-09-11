import type { JsonValue, PluginStorage, PluginStorageScope } from '@openforge-app/plugin-sdk'
import { createMemoryPluginStorage } from '@openforge-app/plugin-sdk/testing'

// The host clones a stored value over a process boundary, so a value the map
// cannot clone is a write the user never gets back.
export function createHostStorage(
  record: (key: string, value: JsonValue) => void = () => undefined,
): PluginStorage {
  const storage = createMemoryPluginStorage()
  const cloning = (scope: PluginStorageScope): PluginStorageScope => ({
    ...scope,
    set: (key, value) => {
      const cloned = structuredClone(value)
      record(key, cloned)
      return scope.set(key, cloned)
    },
  })

  return {
    global: cloning(storage.global),
    project: (projectId) => cloning(storage.project(projectId)),
    task: (taskId) => cloning(storage.task(taskId)),
  }
}
