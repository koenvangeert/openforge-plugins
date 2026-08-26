import { defineBackendPlugin } from '@openforge-app/plugin-sdk/backend'
import { registerHandoffNotesCommands } from './handoffNotesCommands'

export default defineBackendPlugin({
  activate(openforge, context) {
    for (const command of registerHandoffNotesCommands(openforge)) {
      context.subscriptions.add(command)
    }
  },
})
