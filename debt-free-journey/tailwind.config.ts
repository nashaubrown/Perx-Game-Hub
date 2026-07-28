import type { Config } from 'tailwindcss'

// All colors resolve to CSS variables defined in src/app/theme.css.
// Restyle the app there — this file rarely needs to change.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('color-bg'),
        surface: v('color-surface'),
        surface2: v('color-surface-2'),
        border: v('color-border'),
        text: v('color-text'),
        muted: v('color-muted'),
        primary: v('color-primary'),
        'primary-fg': v('color-primary-fg'),
        accent: v('color-accent'),
        success: v('color-success'),
        warning: v('color-warning'),
        danger: v('color-danger'),
      },
      borderRadius: {
        DEFAULT: 'var(--radius-sm)',
        xl: 'var(--radius)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
      },
    },
  },
  plugins: [],
}

export default config
