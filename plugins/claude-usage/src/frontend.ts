import { defineFrontendPlugin } from '@openforge-app/plugin-sdk/frontend'

export default defineFrontendPlugin({
  activate(openforge, context) {
    context.subscriptions.add(
      openforge.views.register({
        id: 'usage',
        title: 'Claude usage',
        icon: 'chart-column-big',
        placement: 'sidebar',
        // Sorts after every plugin that takes the host's default of 100, so the
        // running total sits below the project navigation rather than above it.
        order: 1000,
        component: () => import('./SpendDashboard.svelte'),
        navigationComponent: () => import('./SpendNavigation.svelte'),
      }),
    )

    context.subscriptions.add(
      openforge.settings.registerSection({
        id: 'rescan-interval',
        title: 'Claude usage',
        scope: 'global',
        component: () => import('./UsageSettings.svelte'),
      }),
    )

    context.subscriptions.add(
      openforge.taskUI.registerSection({
        // Past the host's Changes split at 50 and past Handoff Notes at 90, so the
        // running total reads as a footnote under the work rather than above it.
        id: 'task-spend',
        order: 100,
        component: () => import('./TaskSpendSection.svelte'),
      }),
    )
  },
})
