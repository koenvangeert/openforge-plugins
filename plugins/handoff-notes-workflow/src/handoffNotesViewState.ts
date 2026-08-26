export function createHandoffNotesLoadTracker() {
  let hasLoaded = false
  let loadedTaskId = ''
  let loadedProjectId: string | null = null

  return {
    shouldShowLoading(taskId: string, projectId: string | null): boolean {
      return !hasLoaded || loadedTaskId !== taskId || loadedProjectId !== projectId
    },
    markLoaded(taskId: string, projectId: string | null): void {
      hasLoaded = true
      loadedTaskId = taskId
      loadedProjectId = projectId
    },
  }
}
