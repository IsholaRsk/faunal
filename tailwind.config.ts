import type { Config } from 'tailwindcss';

/**
 * FAUNAL design tokens (spec §5). Same palette on mobile + desktop.
 * No flashy colors, no aggressive gradients, no neon, no heavy shadows.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/ui/**/*.ts'],
  theme: {
    extend: {
      colors: {
        canvas: '#F7F7F5',
        surface: '#FFFFFF',
        'surface-2': '#F0F0EC',
        ink: '#151515',
        muted: '#6F6F6A',
        line: '#E5E5E0',
        accent: '#151515',
        'accent-soft': '#8A8A83',
        success: '#4F6B55',
        warning: '#9A7B45',
        danger: '#8B4B4B',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      maxWidth: {
        shell: '1400px',
      },
      borderRadius: {
        card: '14px',
        pill: '999px',
      },
      boxShadow: {
        hair: '0 1px 0 rgba(21,21,21,0.04)',
        lift: '0 10px 30px -18px rgba(21,21,21,0.28)',
        sheet: '0 -18px 46px -26px rgba(21,21,21,0.35)',
      },
      transitionTimingFunction: {
        quiet: 'cubic-bezier(.22,.61,.36,1)',
      },
    },
  },
  plugins: [],
};

export default config;
