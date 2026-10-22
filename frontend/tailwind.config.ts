import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#FAFAF8',
        panel: '#FFFFFF',
        border: {
          DEFAULT: '#E2E8F0',
          light: '#F1F5F9',
        },
        text: {
          primary: '#1E293B',
          secondary: '#475569',
          muted: '#94A3B8',
        },
        copper: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706', // base copper
          700: '#B45309', // dark copper
          800: '#92400E',
          900: '#78350F',
          950: '#451A03',
          DEFAULT: '#D97706',
          dark: '#B45309',
          light: '#FEF3C7',
        },
        status: {
          todo: '#64748B',
          inprogress: '#2563EB',
          inreview: '#7C3AED',
          blocked: '#DC2626',
          done: '#16A34A',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        card: '0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.08)',
        modal: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
      }
    },
  },
  plugins: [],
} satisfies Config
