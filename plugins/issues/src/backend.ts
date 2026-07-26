import { defineBackendPlugin } from '@openforge-app/plugin-sdk/backend'
import type { BackendOpenForgeAPI } from '@openforge-app/plugin-sdk/backend'
import { describeAiError, refineTicket, reviseTicket } from './lib/ai'
import { loadRepoContext } from './lib/ai/context'
import { readAiSettings, resolveProvider } from './lib/settings/aiSettings'
import { createIssue, editIssue, listLabels, listOpenIssues, updateLabelColor } from './lib/github/client'
import { resolveRepoRef } from './lib/github/repoRef'
import {
  computeLabelUsage,
  readColumnLabels,
  readValues,
  resolveColumnLabels,
  writeColumnLabels,
  writeValue,
} from './backend/boardStore'
import type {
  CreateIssueRequest,
  EditIssueRequest,
  Issue,
  IssuesBoard,
  IssuesConfig,
  RefineTicketRequest,
  RepoRef,
  SetColumnLabelsRequest,
  SetValueRequest,
  TicketDraft,
  UpdateLabelColorRequest,
} from './lib/types'

/**
 * The GitHub token OpenForge already holds. `config.get` routes the app's secret
 * keys through the OS keychain, so the board reuses the token the user configured
 * once in OpenForge settings instead of asking for a second one.
 */
async function githubToken(openforge: BackendOpenForgeAPI): Promise<string> {
  const token = await openforge.config.get<string>('github_token')
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('No GitHub token is configured. Add one in OpenForge settings to use the Issues board.')
  }
  return token
}

/** Both things every GitHub-touching method needs, resolved together. */
async function connect(
  openforge: BackendOpenForgeAPI,
  projectId: string,
): Promise<{ repo: RepoRef; token: string }> {
  const [repo, token] = await Promise.all([resolveRepoRef(openforge, projectId), githubToken(openforge)])
  return { repo, token }
}

/** Normalize a colour to GitHub's six-digit lowercase hex, without a leading `#`. */
function normalizeColor(raw: string): string {
  const color = raw.trim().replace(/^#/, '').toLowerCase()
  if (!/^[0-9a-f]{6}$/.test(color)) {
    throw new Error('color must be a six-digit hex color')
  }
  return color
}

export default defineBackendPlugin({
  activate(openforge, context) {
    context.subscriptions.add(
      openforge.backend.registerMethod<{ projectId: string }, IssuesBoard>('issues_get_board', {
        handler: async ({ projectId }) => {
          const { repo, token } = await connect(openforge, projectId)
          const [issues, labels] = await Promise.all([
            listOpenIssues(token, repo),
            listLabels(token, repo),
          ])
          const [values, columnLabels] = await Promise.all([
            readValues(openforge.storage, projectId),
            resolveColumnLabels(openforge.storage, projectId, labels, issues),
          ])
          return { repo, issues, labels, values, columnLabels }
        },
      }),
    )

    context.subscriptions.add(
      openforge.backend.registerMethod<SetValueRequest, null>('issues_set_value', {
        handler: async ({ projectId, issueNumber, value }) => {
          await writeValue(openforge.storage, projectId, issueNumber, value)
          return null
        },
      }),
    )

    context.subscriptions.add(
      openforge.backend.registerMethod<{ projectId: string }, IssuesConfig>('issues_get_config', {
        handler: async ({ projectId }) => {
          const { repo, token } = await connect(openforge, projectId)
          const [issues, labels] = await Promise.all([
            listOpenIssues(token, repo),
            listLabels(token, repo),
          ])
          return {
            columnLabels: (await readColumnLabels(openforge.storage, projectId)) ?? [],
            labels: computeLabelUsage(labels, issues),
          }
        },
      }),
    )

    context.subscriptions.add(
      openforge.backend.registerMethod<SetColumnLabelsRequest, null>('issues_set_column_labels', {
        handler: async ({ projectId, labels }) => {
          await writeColumnLabels(openforge.storage, projectId, labels)
          return null
        },
      }),
    )

    context.subscriptions.add(
      openforge.backend.registerMethod<CreateIssueRequest, { issue: Issue }>('issues_create_issue', {
        handler: async ({ projectId, title, body, labels }) => {
          const { repo, token } = await connect(openforge, projectId)
          return { issue: await createIssue(token, repo, { title, body, labels }) }
        },
      }),
    )

    context.subscriptions.add(
      openforge.backend.registerMethod<EditIssueRequest, null>('issues_edit_issue', {
        handler: async ({ projectId, number, ...input }) => {
          const { repo, token } = await connect(openforge, projectId)
          await editIssue(token, repo, number, input)
          return null
        },
      }),
    )

    context.subscriptions.add(
      openforge.backend.registerMethod<UpdateLabelColorRequest, null>('issues_update_label_color', {
        handler: async ({ projectId, name, color }) => {
          const normalized = normalizeColor(color)
          const { repo, token } = await connect(openforge, projectId)
          await updateLabelColor(token, repo, name, normalized)
          return null
        },
      }),
    )

    // Refine drafts a ticket from a rough note, through whichever of Anthropic or Groq
    // the user has a key for. The keys come from plugin storage, so a user without any
    // gets a gated button (see CreateDialog) rather than a failure at call time.
    context.subscriptions.add(
      openforge.backend.registerMethod<RefineTicketRequest, TicketDraft>('issues_refine_ticket', {
        handler: (request) => refineHandler(openforge, request),
      }),
    )
  },
})

async function refineHandler(
  openforge: BackendOpenForgeAPI,
  request: RefineTicketRequest,
): Promise<TicketDraft> {
  const settings = await readAiSettings(openforge.storage)

  try {
    const context = await loadRepoContext(openforge, {
      projectId: request.projectId,
      repo: request.repo,
      repoLabels: request.repoLabels,
    })

    const draft = request.draft
    return draft
      ? await reviseTicket(settings, { draft, feedback: request.feedback, note: request.text, context })
      : await refineTicket(settings, request.text, context)
  } catch (error) {
    // Surface what the user can act on (a bad key, a rate limit) rather than letting a
    // raw SDK error reach the dialog's error line. Which provider ran decides whose
    // vocabulary the message speaks.
    throw new Error(describeAiError(error, resolveProvider(settings)))
  }
}
