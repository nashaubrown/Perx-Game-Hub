/** Perx Tailwind preset v2 — presets:[require('./tokens/tailwind.preset.js')] */
module.exports = {
  theme:{extend:{
    colors:{
      perx:{DEFAULT:'#34C759',dark:'#28A046',light:'#3DD668',tint:'#F0FDF4'},
      ink:{950:'#0A0A0A',900:'#1A1A1A',700:'#374151',500:'#6B7280',400:'#9CA3AF',200:'#E5E7EB',100:'#F5F5F5',50:'#FAFAFA'},
      success:'#34C759',warning:'#F59E0B',danger:'#F43F5E',info:'#3B82F6',
    },
    fontFamily:{
      display:['Satoshi','Inter','system-ui','sans-serif'],
      sans:['Satoshi','Inter','system-ui','sans-serif'],
      mono:['ui-monospace','SFMono-Regular','Menlo','monospace'],
    },
    fontWeight:{ regular:'400',medium:'500',bold:'700',black:'900' },
    borderRadius:{xs:'2px',sm:'8px',md:'12px',lg:'16px',xl:'24px'},
    backgroundImage:{
      'grad-sunset':'linear-gradient(135deg,#FF5B35,#F0398F)',
      'grad-electric':'linear-gradient(135deg,#5BA6FE,#7C3AED)',
      'grad-berry':'linear-gradient(135deg,#F43F5E,#8B45D4)',
      'grad-azure':'linear-gradient(135deg,#00A6FF,#2563EB)',
    },
    boxShadow:{
      md:'0 4px 16px rgba(10,10,10,.08)',lg:'0 12px 32px rgba(10,10,10,.10)',
      'dark-lift':'0 24px 60px -30px rgba(0,0,0,.9), inset 0 1px 0 rgba(255,255,255,.04)',
    },
    transitionTimingFunction:{standard:'cubic-bezier(0.2,0,0,1)'},
  }},
};
