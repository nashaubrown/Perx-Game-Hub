/** Uses the official Perx design tokens preset (design/tailwind.preset.js). */
module.exports = {
  presets: [require('./design/tailwind.preset.js')],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      backgroundImage: {
        aurora:
          'radial-gradient(60% 60% at 12% 6%, rgba(52,199,89,.35), transparent 60%), radial-gradient(55% 55% at 8% 78%, rgba(46,111,208,.35), transparent 60%), radial-gradient(55% 55% at 92% 70%, rgba(138,69,212,.25), transparent 60%)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pop: {
          '0%': { transform: 'scale(.92)' },
          '60%': { transform: 'scale(1.04)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 240ms cubic-bezier(0.2,0,0,1) both',
        pop: 'pop 240ms cubic-bezier(0.2,0,0,1) both',
      },
    },
  },
  plugins: [],
};
