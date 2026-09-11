import { defineFrontendPlugin } from '@openforge-app/plugin-sdk/frontend'
import TaskMapView from './components/TaskMapView.svelte'

export default defineFrontendPlugin({
  activate(openforge, context) {
    context.subscriptions.add(
      openforge.views.register({
        id: 'map',
        title: 'Task Map',
        icon: 'boxes',
        placement: 'rail',
        order: 50,
        component: TaskMapView,
      }),
    )
  },
})
