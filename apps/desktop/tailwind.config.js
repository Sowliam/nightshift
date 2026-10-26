/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          main: '#0A0908',
          secondary: '#121110',
          elevated: '#1C1A18',
          hover: '#262421',
        },
        highlight: {
          DEFAULT: '#F1FAEE',
          hover: '#FFFFFF',
          text: '#0A0908',
        },
        secondary: {
          DEFAULT: '#F1FAEE',
          hover: '#FFFFFF',
          active: '#E2ECE0',
          subtle: '#1C1A18',
        },
        border: {
          DEFAULT: '#292623',
          subtle: '#1F1D1B',
          strong: '#3D3935',
        },
        text: {
          primary: '#F1FAEE',
          secondary: '#A8A39D',
          muted: '#736E68',
        },
        accent: {
          DEFAULT: '#F1FAEE',
          hover: '#FFFFFF',
          active: '#E2ECE0',
          bright: '#52B788',
          subtle: '#1C1A18',
        },
        destructive: {
          DEFAULT: '#E05252',
          hover: '#F06868',
          subtle: 'rgba(224, 82, 82, 0.15)',
        },
        online: '#52B788',
      },
      fontFamily: {
        sans: ['Vazirmatn', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        subtle: '0 2px 8px rgba(0, 0, 0, 0.4)',
        card: '0 4px 20px rgba(0, 0, 0, 0.6)',
        speaking: '0 0 0 2px #4EBA73',
      },
    },
  },
  plugins: [],
};
