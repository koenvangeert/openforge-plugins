# Warm Linen theme (theme showcase)

An app-enabled Trusted Plugin that registers one selectable theme, **Warm
Linen**: a light, editorial look with a warm paper canvas, ink text, a single
terracotta accent, and hairline borders. It exists to show what a theme-
contributing plugin looks like end to end.

The palette lives in `tokens.js` (one concrete value per required token). The
gradients, top accent rail, and settle animation live in the two selected
stylesheets, which paint the whole app only while Warm Linen is the active
theme. `frontend.js` registers the theme through the public SDK.

## What it demonstrates

- A complete `ThemeTokens` palette, validated by `npm test`.
- Two selected stylesheets on one theme (`stylesheets: [...]`), separate from
  `frontendStyles`.
- Decorative global CSS kept safe: everything added is `pointer-events: none`,
  and animations back off under `prefers-reduced-motion`.

## Install and select

```sh
cd plugins/theme-showcase
npm test
openforge plugin install --path "$PWD"
openforge plugin app enable --plugin-id dev.kvg.theme-showcase
```

Then pick **Warm Linen** in Settings. To leave it, select any built-in theme.
If a bad theme ever obscures Settings, recover from a separate terminal with
`openforge plugin app disable --plugin-id dev.kvg.theme-showcase`.
