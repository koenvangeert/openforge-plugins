import { defineFrontendPlugin } from '@openforge-app/plugin-sdk/frontend'
import PrLensSettings from './PrLensSettings.svelte'
import PrLensTaskPane from './PrLensTaskPane.svelte'

export const PR_LENS_TAB_ID = 'pr-lens'
export const PR_LENS_SETTINGS_SECTION_ID = 'pr-lens'

export default defineFrontendPlugin({
  activate(openforge, context) {
    context.subscriptions.add(openforge.settings.registerSection({
      id: PR_LENS_SETTINGS_SECTION_ID,
      title: 'PR Lens',
      order: 90,
      scope: 'project',
      component: PrLensSettings,
    }))

    context.subscriptions.add(openforge.taskUI.registerTab({
      id: PR_LENS_TAB_ID,
      title: 'PR Lens',
      icon: 'workflow',
      order: 80,
      requiresWorkspace: false,
      component: PrLensTaskPane,
    }))
  },
})
