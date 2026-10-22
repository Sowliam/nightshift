/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          main: '#17191C',
          secondary: '#1D2024',
          elevated: '#24282D',
          hover: '#2A2F35',
        },
        border: {
          subtle: '#30343A',
          strong: '#3F444C',
        },
        text: {
          primary: '#F0F1ED',
          secondary: '#969CA5',
          muted: '#68707B',
        },
        accent: {
          DEFAULT: '#C4D36A',
          hover: '#D5E57B',
          muted: '#8D9B40',
          subtle: 'rgba(196, 211, 106, 0.12)',
        },
        destructive: {
          DEFAULT: '#E05252',
          hover: '#F06868',
          subtle: 'rgba(224, 82, 82, 0.15)',
        },
        online: '#48BB78',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        subtle: '0 2px 8px rgba(0, 0, 0, 0.3)',
        card: '0 4px 20px rgba(0, 0, 0, 0.4)',
        speaking: '0 0 0 2px #C4D36A',
      },
    },
  },
  plugins: [],
};
