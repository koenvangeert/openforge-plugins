import type { StoredDiagram, WorkingTreeCleanliness } from './prLensStorage'

export type DiagramFreshness = 'fresh' | 'stale'
export type ReportedCleanliness = WorkingTreeCleanliness | 'unknown'

export interface DiagramProvenance {
  repo: string
  headSha: string
  headShortSha: string
  headRef: string | null
  baseShortSha: string
  storedAt: string
  cleanliness: ReportedCleanliness
  freshness: DiagramFreshness
}

const SHORT_SHA_LENGTH = 7

export function diagramFreshness(
  stored: StoredDiagram,
  currentSessionId: string | null,
): DiagramFreshness {
  if (stored.sessionId === null || currentSessionId === null) return 'stale'
  return stored.sessionId === currentSessionId ? 'fresh' : 'stale'
}

export function diagramProvenance(
  stored: StoredDiagram,
  currentSessionId: string | null,
): DiagramProvenance {
  const { repo, head, base } = stored.document.provenance
  return {
    repo: `${repo.owner}/${repo.name}`,
    headSha: head.sha,
    headShortSha: head.sha.slice(0, SHORT_SHA_LENGTH),
    headRef: head.ref ?? null,
    baseShortSha: base.sha.slice(0, SHORT_SHA_LENGTH),
    storedAt: stored.storedAt,
    cleanliness: stored.cleanliness ?? 'unknown',
    freshness: diagramFreshness(stored, currentSessionId),
  }
}
