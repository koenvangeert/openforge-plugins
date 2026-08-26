import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { loadStoredHandoffNotes } from './handoffNotesStorage'

export type HandoffNotesLoadResult =
  | {
      status: 'unavailable'
      message: string
    }
  | {
      status: 'ready'
      notes: string
    }

export async function loadHandoffNotes(
  api: FrontendOpenForgeAPI,
  taskId: string,
  projectId: string | null,
): Promise<HandoffNotesLoadResult> {
  if (!projectId) {
    return {
      status: 'unavailable',
      message: 'Open this task in an enabled project to view its Handoff Notes.',
    }
  }

  const [task, notes] = await Promise.all([
    api.tasks.get(taskId),
    loadStoredHandoffNotes(api.storage, taskId),
  ])

  if (!task || task.project_id !== projectId) {
    throw new Error(`Task ${taskId} is no longer available in this project.`)
  }

  return { status: 'ready', notes }
}

export function extractHandoffNotesHeadings(markdown: string): string[] {
  const seen = new Set<string>()
  return [...markdown.matchAll(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)]
    .map((match) => match[1].trim())
    .filter((heading) => {
      const normalizedHeading = normalizeHeading(heading)
      if (seen.has(normalizedHeading)) return false
      seen.add(normalizedHeading)
      return true
    })
}
export type HandoffNotesValidationStatus = 'empty' | 'incomplete' | 'complete'

export interface HandoffNotesValidation {
  status: HandoffNotesValidationStatus
  message: string
  missingHeadings: string[]
}

export function validateHandoffNotes(notes: string, template: string): HandoffNotesValidation {
  const requiredHeadings = extractHandoffNotesHeadings(template)
  if (!notes.trim()) {
    return {
      status: 'empty',
      message: 'No Handoff Notes yet.',
      missingHeadings: requiredHeadings,
    }
  }

  const headings = new Set(
    extractHandoffNotesHeadings(notes).map((heading) => normalizeHeading(heading)),
  )
  const missingHeadings = requiredHeadings
    .filter((heading) => !headings.has(normalizeHeading(heading)))

  return missingHeadings.length === 0
    ? {
        status: 'complete',
        message: 'All template headings are present.',
        missingHeadings: [],
      }
    : {
        status: 'incomplete',
        message: `Missing template headings: ${missingHeadings.join(', ')}.`,
        missingHeadings,
      }
}

function normalizeHeading(heading: string): string {
  return heading.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function messageFrom(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
