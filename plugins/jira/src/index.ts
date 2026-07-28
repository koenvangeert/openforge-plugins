import { defineFrontendPlugin } from '@openforge-app/plugin-sdk/frontend'
import JiraQueryView from './components/JiraQueryView.svelte'
import JiraSettings from './components/JiraSettings.svelte'
import LinkedIssueSection from './components/LinkedIssueSection.svelte'
import { REFRESH_EVENT } from './lib/protocol'

export default defineFrontendPlugin({
  activate(openforge, context) {
    // Active-Project Intake Workspace: Jira discovery, concise context, and
    // OpenForge-owned Issue Intake. Jira remains read-only.
    context.subscriptions.add(
      openforge.views.register({
        id: 'query',
        title: 'Jira',
        icon: 'file-text',
        placement: 'rail',
        order: 40,
        shortcut: 'Cmd+U',
        component: JiraQueryView,
      }),
    )

    // Every Task gets compact, read-only Jira context in its detail stack.
    // Issue Links remain explicit, task-scoped OpenForge-owned state.
    context.subscriptions.add(
      openforge.taskUI.registerSection({
        id: 'linked-issue',
        order: 30,
        component: LinkedIssueSection,
      }),
    )

    // Settings: site / email / API token (stored in storage.global; see ADR 0002).
    context.subscriptions.add(
      openforge.settings.registerSection({
        id: 'credentials',
        title: 'Jira',
        component: JiraSettings,
      }),
    )

    // Manual Intake Workspace refresh. The Linked Issue Section deliberately
    // refreshes only when opened or through its own Refresh action.
    context.subscriptions.add(
      openforge.commands.register({
        id: 'refresh',
        title: 'Refresh Jira',
        icon: 'refresh-cw',
        handler: async () => {
          await openforge.events.emit(REFRESH_EVENT, null)
        },
      }),
    )
  },
})
