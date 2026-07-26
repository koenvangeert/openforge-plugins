import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { BackendOpenForgeAPI } from '@openforge-app/plugin-sdk/backend'
import type { RepoRef } from '../types'

const execFileAsync = promisify(execFile)

/** The project-config key an OpenForge user sets to override remote detection. */
const REPO_HINT_KEY = 'custom_repo_hint'

/** What `resolveRepoRef` needs from the host — narrowed so tests can fake it. */
export type RepoRefApi = Pick<BackendOpenForgeAPI, 'projectConfig' | 'projects'>

/**
 * Parse a GitHub `owner/name` out of either a project-config hint or a git remote URL.
 *
 * Accepts `owner/name`, `https://github.com/owner/name(.git)`,
 * `git@github.com:owner/name(.git)` and `ssh://git@github.com/owner/name(.git)`.
 * Returns `null` when the input carries no owner/name pair.
 */
export function parseOwnerName(raw: string): RepoRef | null {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (trimmed.length === 0) return null

  // Strip transport + host so only the `owner/name` path is left.
  let path: string
  if (trimmed.startsWith('git@')) {
    // git@github.com:owner/name(.git)
    const rest = trimmed.slice('git@'.length)
    const colon = rest.indexOf(':')
    path = colon === -1 ? rest : rest.slice(colon + 1)
  } else {
    const scheme = ['https://', 'http://', 'ssh://git@', 'ssh://'].find((prefix) => trimmed.startsWith(prefix))
    if (scheme) {
      // host/owner/name(.git) — drop the host segment.
      const rest = trimmed.slice(scheme.length)
      const slash = rest.indexOf('/')
      path = slash === -1 ? rest : rest.slice(slash + 1)
    } else {
      // Bare `owner/name` hint.
      path = trimmed
    }
  }

  path = path.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')

  const segments = path.split('/').filter((segment) => segment.length > 0)
  if (segments.length < 2) return null

  const [owner, name] = segments
  return { owner, name }
}

/**
 * Read `git remote get-url origin` in `projectPath`, or `null` when the command
 * fails or the repo has no origin remote.
 */
export async function gitOriginUrl(projectPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', projectPath, 'remote', 'get-url', 'origin'])
    const url = stdout.trim()
    return url.length > 0 ? url : null
  } catch {
    return null
  }
}

/**
 * Resolve the GitHub `owner/name` for a project: the project-config
 * `custom_repo_hint` first, then the origin remote of the project's working copy.
 */
export async function resolveRepoRef(
  openforge: RepoRefApi,
  projectId: string,
  readOriginUrl: (projectPath: string) => Promise<string | null> = gitOriginUrl,
): Promise<RepoRef> {
  const hint = await openforge.projectConfig.get<string>(REPO_HINT_KEY, projectId)
  if (typeof hint === 'string') {
    const fromHint = parseOwnerName(hint)
    if (fromHint) return fromHint
  }

  const project = await openforge.projects.get(projectId)
  if (!project) throw new Error(`project ${projectId} not found`)

  const remoteUrl = await readOriginUrl(project.path)
  if (!remoteUrl) {
    throw new Error(
      `no GitHub repository configured for project ${projectId}: ` +
        `set a ${REPO_HINT_KEY} or an origin remote on ${project.path}`,
    )
  }

  const fromRemote = parseOwnerName(remoteUrl)
  if (!fromRemote) {
    throw new Error(`could not parse a GitHub owner/name from origin remote '${remoteUrl}'`)
  }
  return fromRemote
}
