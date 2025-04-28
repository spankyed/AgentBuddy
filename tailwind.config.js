/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#F0F4F9',
          100: '#D1DFEF',
          200: '#A3BFE0',
          300: '#759FD0',
          400: '#4680C1',
          500: '#3B4D6C', // Primary color
          600: '#304057',
          700: '#253342',
          800: '#1A262E',
          900: '#0F1319',
        },
        accent: {
          50: '#E6FFFE',
          100: '#C0FFFC',
          200: '#93F9F5',
          300: '#5FEAE6',
          400: '#38B2AC', // Accent color
          500: '#2C9D97',
          600: '#207F7A',
          700: '#17615D',
          800: '#0E4341',
          900: '#072524',
        },
        success: {
          50: '#EAFDF0',
          100: '#C8F8D8',
          200: '#92EFAD',
          300: '#5CE082',
          400: '#34C759', // Success color
          500: '#28A346',
          600: '#1D8233',
          700: '#146126',
          800: '#0D4019',
          900: '#06200D',
        },
        warning: {
          50: '#FFF8E6',
          100: '#FFEDB8',
          200: '#FFD97A',
          300: '#FFC53D',
          400: '#FF9F0A', // Warning color
          500: '#F57C00',
          600: '#C65F00',
          700: '#9D4800',
          800: '#743200',
          900: '#4B1F00',
        },
        error: {
          50: '#FEECEC',
          100: '#FACACA',
          200: '#F69898',
          300: '#F16767',
          400: '#FF3B30', // Error color
          500: '#E91C0F',
          600: '#BF140B',
          700: '#950D06',
          800: '#6C0704',
          900: '#420301',
        },
        neutral: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      spacing: {
        '0.5': '4px',
        '1': '8px',
        '1.5': '12px',
        '2': '16px',
        '2.5': '20px',
        '3': '24px',
        '4': '32px',
        '5': '40px',
        '6': '48px',
        '8': '64px',
        '10': '80px',
      },
      boxShadow: {
        'sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
        'DEFAULT': '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-in-out',
        'slide-down': 'slideDown 0.3s ease-in-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};