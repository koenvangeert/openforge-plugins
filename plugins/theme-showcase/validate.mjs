// Proves the theme is complete and well-formed before install/reload.
// validateThemeDefinition checks shape and syntax only, so a pass means every
// required token is present with a non-empty string and the stylesheet paths
// are legal. It does not check contrast or that the CSS paints correctly.
import { validateThemeDefinition } from '@openforge-app/plugin-sdk'
import tokens from './tokens.js'

const definition = {
  id: 'warm-linen',
  label: 'Warm Linen',
  appearance: 'light',
  tokens,
  stylesheets: ['./warm-linen.css', './warm-linen-motion.css'],
}

const result = validateThemeDefinition(definition)

if (!result.valid) {
  console.error('Warm Linen theme is INVALID:')
  for (const error of result.errors) console.error('  -', error)
  process.exit(1)
}

console.log(`Warm Linen theme is valid: all ${Object.keys(tokens).length} tokens present.`)
