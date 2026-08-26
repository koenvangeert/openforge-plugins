import { defineFrontendPlugin } from '@openforge-app/plugin-sdk/frontend'
import HandoffNotesSettings from './HandoffNotesSettings.svelte'
import HandoffNotesTaskPane from './HandoffNotesTaskPane.svelte'
import HandoffNotesTaskSection from './HandoffNotesTaskSection.svelte'
import { ensureHandoffNotesContribution } from './handoffNotesSettings'

export default defineFrontendPlugin({
  async activate(openforge, context) {
    context.subscriptions.add(openforge.taskUI.registerTab({
      id: 'handoff-notes',
      title: 'Handoff Notes',
      icon: 'notebook-pen',
      order: 90,
      component: HandoffNotesTaskPane,
    }))

    context.subscriptions.add(openforge.taskUI.registerSection({
      id: 'handoff-notes',
      order: 90,
      component: HandoffNotesTaskSection,
    }))

    context.subscriptions.add(openforge.settings.registerSection({
      id: 'handoff-notes-workflow',
      title: 'Handoff Notes Workflow',
      order: 90,
      component: HandoffNotesSettings,
    }))

    const { projectId } = openforge.context.getSnapshot()
    if (projectId) {
      await ensureHandoffNotesContribution(openforge.tasks, projectId)
    }
  },
})
