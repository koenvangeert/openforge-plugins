import { defineFrontendPlugin } from '@openforge-app/plugin-sdk/frontend'
import InjectablesView from './InjectablesView.svelte'
import InjectionTrigger from './InjectionTrigger.svelte'
import { pickInjectable } from './lib/pickInjectable'

export default defineFrontendPlugin({
  activate(openforge, context) {
    context.subscriptions.add(openforge.views.register({
      id: 'injectables',
      title: 'Injectables',
      icon: 'sparkles',
      placement: 'rail',
      order: 30,
      shortcut: 'Cmd+L',
      component: InjectablesView,
    }))

    for (const location of ['createTaskPrompt', 'agentSession', 'backlogPrompt'] as const) {
      context.subscriptions.add(
        openforge.injectionPoints.register({ id: `picker-${location}`, location, component: InjectionTrigger }),
      )
    }

    // Lets the board's backlog context menu start a task with a snippet prefixed
    // to its prompt. The host does the starting; this only answers "which text".
    context.subscriptions.add(
      openforge.taskStart.registerPrefixProvider({
        id: 'injectable',
        title: 'Start with injectable…',
        order: 10,
        provide: ({ projectId }) => pickInjectable(openforge, projectId),
      }),
    )
  },
})
