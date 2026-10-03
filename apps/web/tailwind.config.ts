import type { Config } from 'tailwindcss';

// Source: Figma "AI-Sleep_Designathon" > Foundations page (03 Colour, 04 Typography, 05 Space & shape).
// Components must only use these tokens, never raw hex values.
const config: Config = {
  // Dark mode: <html data-theme="dark">, set by the theme switch (lib/theme.ts).
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Base
        ink: 'rgb(var(--c-ink) / <alpha-value>)', // text, dark surfaces
        primary: 'rgb(var(--c-primary) / <alpha-value>)', // navy: primary buttons, nav
        slate: 'rgb(var(--c-slate) / <alpha-value>)', // secondary text, links
        muted: 'rgb(var(--c-muted) / <alpha-value>)', // grey: supporting text
        mist: 'rgb(var(--c-mist) / <alpha-value>)', // disabled, outlines
        sand: '#c9d3de', // avatars, text on navy (Figma accent/sand)
        border: 'rgb(var(--c-border) / <alpha-value>)', // line: borders, dividers
        bg: 'rgb(var(--c-bg) / <alpha-value>)', // canvas: app background
        faint: 'rgb(var(--c-faint) / <alpha-value>)', // landing: de-emphasised headline, store names
        hairline: 'rgb(var(--c-hairline) / <alpha-value>)', // landing: section divider
        surface: 'rgb(var(--c-surface) / <alpha-value>)', // cards
        text: 'rgb(var(--c-text) / <alpha-value>)',
        'on-primary': '#f4f6f8', // light text on dark fills, in both themes
        scrim: '#0d1b2a', // overlays and dark panels, in both themes

        // Accent: olive
        'olive-ink': 'rgb(var(--c-olive-ink) / <alpha-value>)', // brand text, icons
        olive: 'rgb(var(--c-olive) / <alpha-value>)', // accent buttons
        'olive-tint': 'rgb(var(--c-olive-tint) / <alpha-value>)', // highlights, Fresh

        // Status: solid colour + soft tint
        success: 'rgb(var(--c-success) / <alpha-value>)',
        'success-tint': 'rgb(var(--c-success-tint) / <alpha-value>)',
        warning: 'rgb(var(--c-warning) / <alpha-value>)',
        'warning-tint': 'rgb(var(--c-warning-tint) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        'danger-tint': 'rgb(var(--c-danger-tint) / <alpha-value>)',
        info: 'rgb(var(--c-info) / <alpha-value>)',
        'info-tint': 'rgb(var(--c-info-tint) / <alpha-value>)',

        // Brand tints: ink on tint
        fresh: 'rgb(var(--c-fresh) / <alpha-value>)',
        'fresh-tint': 'rgb(var(--c-fresh-tint) / <alpha-value>)',
        style: 'rgb(var(--c-style) / <alpha-value>)',
        'style-tint': 'rgb(var(--c-style-tint) / <alpha-value>)',
        tech: 'rgb(var(--c-tech) / <alpha-value>)',
        'tech-tint': 'rgb(var(--c-tech-tint) / <alpha-value>)',
        chilled: 'rgb(var(--c-chilled) / <alpha-value>)',
        'chilled-tint': 'rgb(var(--c-chilled-tint) / <alpha-value>)',

        // Driver screens: SOS page (Figma "Driver / SOS"), offline banner, peek and call cards
        sos: '#7f1d1d',
        'sos-mid': '#991b1b',
        'sos-soft': '#fecaca',
        banner: 'rgb(var(--c-banner) / <alpha-value>)',
        peek: 'rgb(var(--c-peek) / <alpha-value>)',
        sage: 'rgb(var(--c-sage) / <alpha-value>)',

        // Plan board (Figma "Plan v2"): row wash and the over-capacity trip card
        wash: 'rgb(var(--c-wash) / <alpha-value>)',
        'danger-wash': 'rgb(var(--c-danger-wash) / <alpha-value>)',
        'danger-line': 'rgb(var(--c-danger-line) / <alpha-value>)',
        'olive-wash': 'rgb(var(--c-olive-wash) / <alpha-value>)', // an empty trip you just created

        // Dispatch board (Figma "Dispatch board"): trips on the road, the next stop, a later stop
        blue: 'rgb(var(--c-blue) / <alpha-value>)',
        quiet: 'rgb(var(--c-quiet) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'DM Sans', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        eyebrow: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.06em', fontWeight: '700' }], // 11-12, caps
        caption: ['0.75rem', { lineHeight: '1.05rem' }], // 12
        label: ['0.8125rem', { lineHeight: '1.1375rem', fontWeight: '600' }], // 12-13 SemiBold
        body: ['0.9375rem', { lineHeight: '1.40625rem' }], // 14-15 / 150%
        'body-lg': ['1.125rem', { lineHeight: '1.6875rem' }], // 18 / 150%
        title: ['1.125rem', { lineHeight: '1.625rem', fontWeight: '600' }], // Heading 3, 17-24
        heading: ['1.5rem', { lineHeight: '2rem', fontWeight: '600' }], // Heading 3 upper
        h2: ['2.5rem', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '500' }], // 36-40
        h1: ['3.25rem', { lineHeight: '1.1', letterSpacing: '-0.025em', fontWeight: '500' }], // 48-52
        display: ['4.625rem', { lineHeight: '1.04', letterSpacing: '-0.03em', fontWeight: '500' }], // 74
      },
      spacing: {
        // 8-point rhythm: 4 8 12 16 24 32 48 64 96
        xs: '4px', // icon to label
        sm: '8px',
        chip: '12px', // chip padding
        md: '16px', // list gaps
        lg: '24px', // card gaps
        xl: '32px', // card padding
        '2xl': '48px', // group spacing
        '3xl': '64px', // section inner
        '4xl': '96px', // board padding
      },
      borderRadius: {
        tag: '4px',
        input: '14px',
        note: '16px',
        card: '24px',
        hero: '28px',
        pill: '999px',
      },
      boxShadow: {
        // Elevation: flat (none), outlined (border-mist), raised (floating things only)
        raised: '0 16px 36px 0 rgba(13, 26, 41, 0.16)',
        // Plan board: the order being dragged, and the order drawer
        ghost: '0 14px 40px 0 rgba(13, 26, 41, 0.2)',
      },
    },
  },
  plugins: [],
};

export default config;
