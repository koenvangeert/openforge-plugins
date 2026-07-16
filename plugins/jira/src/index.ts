import { defineFrontendPlugin } from '@openforge-app/plugin-sdk/frontend'
import JiraQueryView from './components/JiraQueryView.svelte'
import JiraSettings from './components/JiraSettings.svelte'
import { REFRESH_EVENT } from './lib/protocol'

export default defineFrontendPlugin({
  activate(openforge, context) {
    // Rail view: a user-editable JQL query over Jira Cloud.
    context.subscriptions.add(
      openforge.views.register({
        id: 'query',
        title: 'Jira',
        icon: 'square-check-big',
        placement: 'rail',
        order: 40,
        component: JiraQueryView,
      }),
    )

    // NOTE: the task-pane tab (the Jira issue linked to the open task) is
    // temporarily disabled. Its component (JiraTaskTab.svelte) and controller
    // (lib/taskLink.ts) remain in the tree so it can be re-registered later.

    // Settings: site / email / API token (stored in storage.global; see ADR 0002).
    context.subscriptions.add(
      openforge.settings.registerSection({
        id: 'credentials',
        title: 'Jira',
        component: JiraSettings,
      }),
    )

    // Manual refresh: a command that both surfaces listen for (they also have
    // their own Refresh/Run buttons). No background polling.
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
