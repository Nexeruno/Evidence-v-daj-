/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        light: {
          bg: '#F3F6FB',
          card: '#FFFFFF',
          text: '#111827',
          textMuted: '#6B7280',
          border: '#E5E7EB',
        },
        dark: {
          bg: '#0F172A',
          card: '#1E293B',
          text: '#F1F5F9',
          textMuted: '#94A3B8',
          border: '#334155',
        }
      },
    },
  },
  plugins: [],
}
