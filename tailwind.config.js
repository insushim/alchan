/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  darkMode: 'class', // 다크 모드 활성화
  theme: {
    extend: {
      fontFamily: {
        'jua': ['Jua', 'sans-serif'],
        'gamja': ['"Gamja Flower"', 'cursive'],
        'dancing': ['"Dancing Script"', 'cursive'],
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out forwards',
        'slide-up': 'slideUp 0.5s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      boxShadow: {
        'alchan': '0 4px 6px -1px rgba(99, 102, 241, 0.1), 0 2px 4px -2px rgba(99, 102, 241, 0.1)',
        'alchan-lg': '0 10px 15px -3px rgba(99, 102, 241, 0.1), 0 4px 6px -4px rgba(99, 102, 241, 0.1)',
      },
      colors: {
        alchan: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        }
      }
    },
  },
  plugins: [],
  // preflight 활성화하여 Tailwind 기본 스타일 적용
  corePlugins: {
    preflight: true,
  },
}
