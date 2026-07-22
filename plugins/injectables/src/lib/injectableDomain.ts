/**
 * A personal, reusable text snippet shown in the injectable picker. Owned by this
 * plugin and persisted to the filesystem via its backend snippet methods. Inserts
 * its literal `body` verbatim.
 */
export interface Snippet {
  id: string;
  name: string;
  body: string;
  /** When true, the snippet is available in every project (including future ones). */
  allProjects: boolean;
  /** Explicit project ids the snippet is scoped to; empty when `allProjects`. */
  projectIds: string[];
}

// ── Injectable picker ───────────────────────────────────────────────────────
// The view model behind the injectable picker (skills + commands + snippets),
// shared by the app's ⌘⇧I picker and the skills plugin's Skills tab.

export type InjectableKind = 'skill' | 'command' | 'snippet';
export type InjectableOrigin = 'personal' | 'project' | 'plugin' | 'builtin';
export type InjectableTriggerMode = 'auto+manual' | 'manual-only';
export type InjectableGroupBy = 'origin' | 'trigger';

/** Snippets are grouped/filtered as their own top-level section, ahead of the
 * file-scanned origins, in both group-by modes. */
export type InjectableSection = 'snippet' | InjectableOrigin;

export interface Injectable {
  /** `${origin}:${kind}:${name}` for skills/commands; `snippet:${dbId}` for snippets — unique, safe for keyed {#each} */
  id: string;
  kind: InjectableKind;
  name: string;
  description: string | null;
  origin: InjectableOrigin;
  triggerMode: InjectableTriggerMode;
  /** Claude source dir the item lives under (e.g. `.claude`); null when tool/plugin-provided */
  sourceDir: string | null;
  /** dir/file identity + the detail "source" line */
  sourcePath: string | null;
  /** full SKILL.md body for the reading pane; null when there is no source file */
  content: string | null;
  /** `/${name} ` */
  invocationText: string;
}
