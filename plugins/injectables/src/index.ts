import { defineFrontendPlugin } from '@openforge-app/plugin-sdk/frontend'
import InjectablesView from './InjectablesView.svelte'
import InjectionTrigger from './InjectionTrigger.svelte'

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
  },
})
