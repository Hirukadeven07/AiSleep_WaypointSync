import type { Config } from 'tailwindcss';

// Placeholder values - the frontend lead replaces these with the Figma Foundations values.
// Components must only use these tokens, never raw hex values.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#1B2A41',
        surface: '#243650',
        border: '#3A4F6D',
        text: '#F2F5F9',
        muted: '#9DABC0',
        primary: '#9BC53D',
        success: '#4CAF7A',
        warning: '#E5A93B',
        danger: '#E0564F',
        chilled: '#5BC0DE',
        'on-primary': '#1B2A41',
      },
      fontSize: {
        caption: ['0.75rem', { lineHeight: '1rem' }],
        label: ['0.875rem', { lineHeight: '1.25rem' }],
        body: ['1rem', { lineHeight: '1.5rem' }],
        title: ['1.25rem', { lineHeight: '1.75rem' }],
        heading: ['1.75rem', { lineHeight: '2.25rem' }],
        display: ['2.5rem', { lineHeight: '3rem' }],
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        '2xl': '48px',
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
};

export default config;
