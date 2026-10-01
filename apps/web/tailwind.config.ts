import type { Config } from 'tailwindcss';

// Source: Figma "AI-Sleep_Designathon" > Foundations page (03 Colour, 04 Typography, 05 Space & shape).
// Components must only use these tokens, never raw hex values.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Base
        ink: '#0d1b2a', // text, dark surfaces
        primary: '#1b263b', // navy: primary buttons, nav
        slate: '#415a77', // secondary text, links
        muted: '#5b6b7f', // grey: supporting text
        mist: '#c9d1da', // disabled, outlines
        sand: '#c9d3de', // avatars, text on navy (Figma accent/sand)
        border: '#e3e7ec', // line: borders, dividers
        bg: '#f4f6f8', // canvas: app background
        faint: '#94a3b8', // landing: de-emphasised headline, store names
        hairline: '#eef1f4', // landing: section divider
        surface: '#ffffff', // cards
        text: '#0d1b2a',
        'on-primary': '#f4f6f8',

        // Accent: olive
        'olive-ink': '#6b7340', // brand text, icons
        olive: '#c3ca92', // accent buttons
        'olive-tint': '#e6e9cc', // highlights, Fresh

        // Status: solid colour + soft tint
        success: '#5e7d2f',
        'success-tint': '#edf0d8',
        warning: '#c27c0e',
        'warning-tint': '#f7ecd6',
        danger: '#c53030',
        'danger-tint': '#f8e3e3',
        info: '#415a77',
        'info-tint': '#e1e8f0',

        // Brand tints: ink on tint
        fresh: '#6b7340',
        'fresh-tint': '#e6e9cc',
        style: '#a45a6b',
        'style-tint': '#eddce0',
        tech: '#8c7a55',
        'tech-tint': '#efe6d3',
        chilled: '#2b8a9e',
        'chilled-tint': '#ddeff2',
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
      },
    },
  },
  plugins: [],
};

export default config;
