// The Intake Template: a per-Project text template that arranges the Intake
// Context (Issue Key, summary, description) into a new Task's initial prompt
// during Issue Intake. It controls layout only — the set of available fields is
// fixed to the Intake Context and never widens to a full Jira Issue mirror.

import type { JsonValue } from '@openforge-app/plugin-sdk'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { sanitizeHtml } from '@openforge-app/plugin-sdk/sanitize'
import type { JiraIssue } from './jiraTypes'
import { PROJECT_KEY } from './protocol'

type Api = Pick<FrontendOpenForgeAPI, 'storage'>

type IntakeContextIssue = Pick<JiraIssue, 'key' | 'summary' | 'descriptionHtml'>

/** The Intake Context fields a template may reference, lower-cased. */
export const TEMPLATE_PLACEHOLDERS = ['key', 'summary', 'description'] as const
type TemplatePlaceholder = (typeof TEMPLATE_PLACEHOLDERS)[number]

/**
 * The template a Project uses until it saves its own. Reproduces the legacy
 * `KEY: summary` heading, a blank line, then the description — so a Project that
 * never touches its template keeps exactly the old Issue Intake prompt.
 */
export const DEFAULT_INTAKE_TEMPLATE = '{{key}}: {{summary}}\n\n{{description}}'

/** Matches a `{{ placeholder }}` token, capturing the (untrimmed) inner name. */
const PLACEHOLDER_TOKEN = /\{\{\s*([^}]*?)\s*\}\}/g

/** Resolve a placeholder name (any case) to its canonical field, or null if unsupported. */
function toKnownPlaceholder(name: string): TemplatePlaceholder | null {
  const lower = name.toLowerCase()
  return (TEMPLATE_PLACEHOLDERS as readonly string[]).includes(lower) ? (lower as TemplatePlaceholder) : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function knownPlaceholderList(): string {
  return TEMPLATE_PLACEHOLDERS.map((name) => `{{${name}}}`).join(', ')
}

export type TemplateValidation =
  | { ok: true; template: string }
  | { ok: false; message: string }

/**
 * Guard a template before it is saved: reject a blank template (it would create
 * Tasks with empty prompts) and reject any placeholder outside the Intake
 * Context. Returns the trimmed template on success.
 */
export function validateIntakeTemplate(input: string): TemplateValidation {
  const template = input.trim()
  if (template.length === 0) return { ok: false, message: 'The Intake template must not be empty.' }

  const unknown = [...template.matchAll(PLACEHOLDER_TOKEN)]
    .map((match) => match[1])
    .filter((name) => toKnownPlaceholder(name) === null)
  if (unknown.length > 0) {
    const offenders = [...new Set(unknown.map((name) => `{{${name}}}`))].join(', ')
    return { ok: false, message: `Unknown placeholder ${offenders}. Available placeholders: ${knownPlaceholderList()}.` }
  }
  return { ok: true, template }
}

/** Resolve the Intake Context fields to their substituted, normalized values. */
function placeholderValues(issue: IntakeContextIssue): Record<TemplatePlaceholder, string> {
  return {
    key: issue.key.trim().toUpperCase(),
    summary: issue.summary.trim(),
    description: sanitizeHtml(issue.descriptionHtml).trim(),
  }
}

/**
 * Arrange an Issue's Intake Context with the given template. Known placeholders
 * are substituted literally (an empty field becomes an empty string); the whole
 * result is trimmed so a trailing empty field leaves no dangling whitespace.
 * Unknown placeholders are left untouched — {@link validateIntakeTemplate} and
 * {@link readIntakeTemplate} ensure a rendered template only holds known ones.
 */
export function renderIntakeTemplate(template: string, issue: IntakeContextIssue): string {
  const values = placeholderValues(issue)
  return template
    .replace(PLACEHOLDER_TOKEN, (token, name: string) => {
      const placeholder = toKnownPlaceholder(name)
      return placeholder ? values[placeholder] : token
    })
    .trim()
}

function normalizeIntakeTemplate(raw: unknown): string {
  if (isRecord(raw) && typeof raw.template === 'string') {
    const validation = validateIntakeTemplate(raw.template)
    if (validation.ok) return validation.template
  }
  return DEFAULT_INTAKE_TEMPLATE
}

function toJson(template: string): JsonValue {
  return { template }
}

/**
 * Read the Project's persisted Intake Template, repairing a missing, malformed,
 * or invalid value (blank or unknown-placeholder) back to the default.
 */
export async function readIntakeTemplate(api: Api, projectId: string): Promise<string> {
  const store = api.storage.project(projectId)
  const raw = await store.get(PROJECT_KEY.intakeTemplate)
  const template = normalizeIntakeTemplate(raw)
  if (!isRecord(raw) || raw.template !== template) {
    await store.set(PROJECT_KEY.intakeTemplate, toJson(template))
  }
  return template
}

/** Persist the Project's Intake Template. Rejects an invalid template so intake never breaks. */
export async function saveIntakeTemplate(api: Api, projectId: string, template: string): Promise<string> {
  const validation = validateIntakeTemplate(template)
  if (!validation.ok) throw new Error(validation.message)
  await api.storage.project(projectId).set(PROJECT_KEY.intakeTemplate, toJson(validation.template))
  return validation.template
}
