<script lang="ts">
  import { tick } from 'svelte'
  import type { JiraIssue } from '../lib/jiraTypes'
  import type { DuplicateConfirmationRequired, IssueLinkState, LinkedTaskSummary } from '../lib/intakeController'

  type IntakeAction = 'create' | 'create-start'
  type IntakeNotice = { tone: 'success' | 'error'; message: string }

  interface Props {
    issue: JiraIssue | null
    linkState: IssueLinkState | undefined
    intakeBusy: boolean
    intakeNotice: IntakeNotice | null
    duplicateWarning: (DuplicateConfirmationRequired & { action: IntakeAction }) | null
    focusRequest: number
    onOpenJira: (url: string) => void
    onOpenTask: (taskId: string) => void
    onIntake: (action: IntakeAction, duplicateConfirmed?: boolean) => Promise<void>
    onCancelDuplicate: () => void
  }

  let {
    issue,
    linkState,
    intakeBusy,
    intakeNotice,
    duplicateWarning,
    focusRequest,
    onOpenJira,
    onOpenTask,
    onIntake,
    onCancelDuplicate,
  }: Props = $props()

  function statusBadgeClass(status: LinkedTaskSummary['status']): string {
    if (status === 'doing') return 'badge-info'
    if (status === 'done') return 'badge-success'
    return 'badge-ghost'
  }

  let detailsHeading: HTMLHeadingElement | undefined = $state()
  let confirmDuplicateButton: HTMLButtonElement | undefined = $state()
  let createButton: HTMLButtonElement | undefined = $state()
  let createStartButton: HTMLButtonElement | undefined = $state()

  function formatUpdated(value: string): string {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
  }

  $effect(() => {
    if (focusRequest === 0) return
    void tick().then(() => detailsHeading?.focus())
  })

  $effect(() => {
    if (!duplicateWarning) return
    void tick().then(() => confirmDuplicateButton?.focus())
  })

  function focusAction(action: IntakeAction) {
    const button = action === 'create' ? createButton : createStartButton
    button?.focus()
  }

  async function confirmDuplicate() {
    const action = duplicateWarning?.action
    if (!action) return
    await onIntake(action, true)
    await tick()
    focusAction(action)
  }

  async function cancelDuplicate() {
    const action = duplicateWarning?.action
    onCancelDuplicate()
    await tick()
    if (action) focusAction(action)
  }
</script>

<aside class="min-h-0 overflow-auto p-5" aria-label="Issue details">
  {#if issue}
    <div class="flex h-full flex-col gap-5">
      <div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-medium text-primary">{issue.key}</span>
          <button class="btn btn-ghost btn-xs" onclick={() => onOpenJira(issue.url)}>Open in Jira</button>
        </div>
        <h2
          class="mt-1 text-xl font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary"
          tabindex="-1"
          bind:this={detailsHeading}
        >{issue.summary}</h2>
      </div>
      <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <dt class="text-base-content/60">Status</dt><dd>{issue.status}</dd>
        <dt class="text-base-content/60">Priority</dt><dd>{issue.priority ?? 'None'}</dd>
        <dt class="text-base-content/60">Assignee</dt><dd>{issue.assignee ?? 'Unassigned'}</dd>
        <dt class="text-base-content/60">Issue type</dt><dd>{issue.issueType}</dd>
        {#if issue.updated}
          <dt class="text-base-content/60">Updated</dt>
          <dd><time datetime={issue.updated}>{formatUpdated(issue.updated)}</time></dd>
        {/if}
        <dt class="text-base-content/60">OpenForge</dt>
        <dd>
          {#if linkState && linkState.tasks.length > 0}
            <ul class="flex flex-col gap-1" aria-label="Linked OpenForge Tasks">
              {#each linkState.tasks as task (task.id)}
                <li class="flex items-center gap-2">
                  <button
                    type="button"
                    class="link link-primary min-w-0 truncate text-left"
                    title={task.title}
                    onclick={() => onOpenTask(task.id)}
                  >{task.title}</button>
                  <span class="badge badge-sm whitespace-nowrap {statusBadgeClass(task.status)}">{task.status}</span>
                </li>
              {/each}
            </ul>
          {:else}
            No linked Tasks
          {/if}
        </dd>
      </dl>
      <div>
        <h3 class="mb-2 font-semibold">Description</h3>
        {#if issue.descriptionHtml}
          <div class="max-w-full space-y-2 break-words text-sm leading-relaxed text-base-content/80">{@html issue.descriptionHtml}</div>
        {:else}
          <p class="text-sm text-base-content/60">No description provided.</p>
        {/if}
      </div>
      {#if duplicateWarning}
        <div class="alert alert-warning flex-col items-start gap-3 text-sm" role="alert">
          <span>{duplicateWarning.message}</span>
          <div class="flex flex-wrap gap-2">
            <button
              class="btn btn-warning btn-sm"
              onclick={() => void confirmDuplicate()}
              disabled={intakeBusy}
              bind:this={confirmDuplicateButton}
            >
              {duplicateWarning.action === 'create' ? 'Create another Task' : 'Create and Start another Task'}
            </button>
            <button class="btn btn-ghost btn-sm" onclick={() => void cancelDuplicate()}>Cancel</button>
          </div>
        </div>
      {/if}
      {#if intakeNotice}
        <div
          class="alert text-sm {intakeNotice.tone === 'success' ? 'alert-success' : 'alert-error'}"
          role={intakeNotice.tone === 'success' ? 'status' : 'alert'}
        >{intakeNotice.message}</div>
      {/if}
      <div class="grid grid-cols-2 gap-2 border-t border-base-300 pt-3">
        <button
          class="btn btn-outline"
          onclick={() => void onIntake('create')}
          disabled={intakeBusy}
          bind:this={createButton}
        >Create Task</button>
        <button
          class="btn btn-primary"
          onclick={() => void onIntake('create-start')}
          disabled={intakeBusy}
          bind:this={createStartButton}
        >
          {#if intakeBusy}<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>{/if}
          Create and Start
        </button>
      </div>
    </div>
  {:else}
    <div class="flex h-full items-center justify-center text-center text-sm text-base-content/60">
      Select an Issue to review its Intake context.
    </div>
  {/if}
</aside>
