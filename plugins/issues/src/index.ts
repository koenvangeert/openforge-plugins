import { defineFrontendPlugin } from '@openforge-app/plugin-sdk/frontend'
import IssuesView from './components/IssuesView.svelte'
import LinkedIssuePane from './components/LinkedIssuePane.svelte'
import SettingsSection from './components/SettingsSection.svelte'

export const IssuesViewComponent = IssuesView
export const LinkedIssuePaneComponent = LinkedIssuePane
export const IssuesSettingsSectionComponent = SettingsSection

export default defineFrontendPlugin({
  activate(openforge, context) {
    context.subscriptions.add(
      openforge.views.register({
        id: 'issues',
        title: 'Issues',
        icon: 'kanban',
        placement: 'rail',
        order: 21,
        shortcut: 'Cmd+R',
        component: IssuesView,
      }),
    )
    context.subscriptions.add(
      openforge.taskPane.registerTab({
        id: 'issue',
        title: 'Linked issue',
        icon: 'ticket',
        order: 30,
        component: LinkedIssuePane,
      }),
    )
    context.subscriptions.add(
      openforge.settings.registerSection({
        id: 'issues-settings',
        title: 'Issues',
        // The API key is one value for the whole app (stored in global plugin
        // storage), so it belongs in the plugin's card in global settings, not on a
        // per-project page.
        scope: 'global',
        component: SettingsSection,
      }),
    )
  },
})
