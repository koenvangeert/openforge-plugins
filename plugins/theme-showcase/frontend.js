import { defineFrontendPlugin } from '@openforge-app/plugin-sdk/frontend'
import tokens from './tokens.js'

export default defineFrontendPlugin({
  activate(openforge, context) {
    context.subscriptions.add(
      openforge.themes.register({
        id: 'warm-linen',
        label: 'Warm Linen',
        appearance: 'light',
        tokens,
        stylesheets: ['./warm-linen.css', './warm-linen-motion.css'],
      }),
    )
  },
})
