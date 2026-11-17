/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        ios: {
          bg: 'rgb(var(--ios-bg) / <alpha-value>)',
          surface: 'rgb(var(--ios-surface) / <alpha-value>)',
          glass: 'rgb(var(--ios-glass) / <alpha-value>)',
          separator: 'rgb(var(--ios-separator) / <alpha-value>)',
          label: 'rgb(var(--ios-label) / <alpha-value>)',
          secondary: 'rgb(var(--ios-secondary) / <alpha-value>)',
          fill: 'rgb(var(--ios-fill) / <alpha-value>)',
          incoming: 'rgb(var(--ios-incoming) / <alpha-value>)',
          blue: '#007AFF',
        },
        // Theme cosmetics rewrite these RGB channels at runtime.
        accent: {
          50: 'rgb(var(--accent-50) / <alpha-value>)',
          100: 'rgb(var(--accent-100) / <alpha-value>)',
          200: 'rgb(var(--accent-200) / <alpha-value>)',
          300: 'rgb(var(--accent-300) / <alpha-value>)',
          400: 'rgb(var(--accent-400) / <alpha-value>)',
          500: 'rgb(var(--accent-500) / <alpha-value>)',
          600: 'rgb(var(--accent-600) / <alpha-value>)',
          700: 'rgb(var(--accent-700) / <alpha-value>)',
          800: 'rgb(var(--accent-800) / <alpha-value>)',
          900: 'rgb(var(--accent-900) / <alpha-value>)',
          950: 'rgb(var(--accent-950) / <alpha-value>)',
        },
      },
      boxShadow: {
        soft: '0 12px 40px -18px rgb(0 0 0 / 0.22)',
        glow: '0 8px 24px -8px rgb(0 122 255 / 0.55)',
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'slide-up': 'slide-up 220ms ease-out',
        'toast-in': 'toast-in 240ms ease-out',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px) scale(.99)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};
