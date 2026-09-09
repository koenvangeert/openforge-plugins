import { defineBackendPlugin } from '@openforge-app/plugin-sdk/backend'
import { registerPrLensCommands } from './prLensCommands'

export default defineBackendPlugin({
  activate(openforge, context) {
    for (const command of registerPrLensCommands(openforge)) {
      context.subscriptions.add(command)
    }
  },
})
