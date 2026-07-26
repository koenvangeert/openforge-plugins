// Board state that GitHub does not hold: the per-issue value and the curated
// column order.
//
// Both used to live in OpenForge's database (`roadmap_item_value` and
// `roadmap_repo_config`). They are now project-scoped plugin storage, so the
// plugin owns everything it persists.

import type { PluginStorage } from '@openforge-app/plugin-sdk'
import type { Issue, LabelUsage, RepoLabel } from '../lib/types'

const VALUES_KEY = 'issueValues'
const COLUMN_LABELS_KEY = 'columnLabels'

/** Issue number (as a string, since JSON object keys are strings) → value 1..10. */
export type IssueValues = Record<string, number>

/**
 * For each repo label, whether at least one open issue carries it. Order follows
 * `repoLabels` so the seeded columns come out in the repo's own label order.
 */
export function computeLabelUsage(repoLabels: RepoLabel[], issues: Issue[]): LabelUsage[] {
  const used = new Set<string>()
  for (const issue of issues) {
    for (const label of issue.labels) used.add(label.name)
  }
  return repoLabels.map((label) => ({ name: label.name, color: label.color, used: used.has(label.name) }))
}

export async function readValues(storage: PluginStorage, projectId: string): Promise<IssueValues> {
  const stored = await storage.project(projectId).get<IssueValues>(VALUES_KEY)
  return stored ?? {}
}

/**
 * Set or clear the value for one issue. Clearing deletes the entry rather than
 * storing a null, so `readValues` only ever reports issues with an active value.
 */
export async function writeValue(
  storage: PluginStorage,
  projectId: string,
  issueNumber: number,
  value: number | null,
): Promise<void> {
  if (value !== null && (!Number.isInteger(value) || value < 1 || value > 10)) {
    throw new Error('value must be an integer between 1 and 10, or null')
  }

  const values = await readValues(storage, projectId)
  if (value === null) {
    delete values[String(issueNumber)]
  } else {
    values[String(issueNumber)] = value
  }
  await storage.project(projectId).set<IssueValues>(VALUES_KEY, values)
}

/**
 * The curated column labels, or `null` when the project has never had any. The
 * distinction matters: `null` means "seed me", `[]` means the user cleared the
 * board on purpose and must not be re-seeded.
 */
export function readColumnLabels(storage: PluginStorage, projectId: string): Promise<string[] | null> {
  return storage.project(projectId).get<string[]>(COLUMN_LABELS_KEY)
}

export async function writeColumnLabels(
  storage: PluginStorage,
  projectId: string,
  labels: string[],
): Promise<void> {
  await storage.project(projectId).set<string[]>(COLUMN_LABELS_KEY, labels)
}

/**
 * The columns to render, seeding on first open from the labels actually in use and
 * persisting the seed so it happens exactly once.
 */
export async function resolveColumnLabels(
  storage: PluginStorage,
  projectId: string,
  repoLabels: RepoLabel[],
  issues: Issue[],
): Promise<string[]> {
  const existing = await readColumnLabels(storage, projectId)
  if (existing !== null) return existing

  const seeded = computeLabelUsage(repoLabels, issues)
    .filter((usage) => usage.used)
    .map((usage) => usage.name)
  await writeColumnLabels(storage, projectId, seeded)
  return seeded
}
