# Restyling Debt-Free Journey

The whole UI is driven by design tokens. You should almost never need to touch
component code to change how the app looks.

## Where things live

| What | Where |
|---|---|
| **Colors, radii, fonts, chart palette** | `src/app/theme.css` — the single source of truth |
| Token → Tailwind mapping | `tailwind.config.ts` (rarely changes) |
| Global element styles (sliders, confetti) | `src/app/globals.css` |
| UI primitives (Button, Card, Input, …) | `src/components/ui/index.tsx` |

## Change the look in 30 seconds

Open `src/app/theme.css` and edit the `:root` block. Every value is a CSS
variable; colors are raw RGB triplets (`13 110 253`, not `#0d6efd`) so
Tailwind opacity utilities like `bg-primary/10` keep working.

```css
:root {
  --color-primary: 13 110 253;  /* buttons, links, active nav */
  --radius: 14px;               /* card corner rounding */
  --font-sans: 'Inter', sans-serif;
  --chart-1: 13 110 253;        /* first chart series color */
}
```

Save — the dev server hot-reloads and the entire app (including charts and
confetti, which read the `--chart-*` variables at runtime) picks up the change.

## Add a whole new theme preset

1. Copy any `[data-theme='…']` block in `theme.css`, rename it, e.g.
   `[data-theme='perx']`, and change the values.
2. Add one entry to the `THEMES` array in `src/app/settings/page.tsx`.

That's it — it appears in Settings → Appearance and persists via
`localStorage`. The `midnight` preset shows how a dark theme works: same
tokens, darker values, nothing else changes.

## Changing component shapes/spacing

The primitives in `src/components/ui/index.tsx` are ~30 lines each and plain
Tailwind. Because every color class (`bg-primary`, `text-muted`, `border-border`,
…) resolves to tokens, you can restructure a component freely without breaking
theming.
