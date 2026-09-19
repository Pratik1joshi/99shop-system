/**
 * Hero mascot, lifted verbatim from the shop's original page.
 *
 * Kept as inline SVG rather than a file so it picks up the `--bunny-*` theme
 * variables and re-tints itself in dark mode.
 */
export default function BunnyMascot() {
  return (
      <div className="bunny-3d">
      <svg viewBox="0 0 320 340" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Kawaii bunny mascot">
      <defs>
      <radialGradient id="furGrad" cx="35%" cy="26%" r="80%">
      <stop offset="0%" stopColor="var(--bunny-fur-1)"/>
      <stop offset="55%" stopColor="var(--bunny-fur-2)"/>
      <stop offset="100%" stopColor="var(--bunny-fur-3)"/>
      </radialGradient>
      <radialGradient id="rimShade" cx="72%" cy="78%" r="55%">
      <stop offset="0%" stopColor="var(--bunny-line)" stopOpacity="0.16"/>
      <stop offset="100%" stopColor="var(--bunny-line)" stopOpacity="0"/>
      </radialGradient>
      <radialGradient id="shineGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95"/>
      <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0"/>
      </radialGradient>
      <linearGradient id="earGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="var(--bunny-ear-1)"/>
      <stop offset="100%" stopColor="var(--bunny-ear-2)"/>
      </linearGradient>
      <radialGradient id="innerEarGrad" cx="50%" cy="20%" r="90%">
      <stop offset="0%" stopColor="var(--pink)"/>
      <stop offset="100%" stopColor="var(--pink-deep)"/>
      </radialGradient>
      <radialGradient id="cheekGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stopColor="var(--pink)" stopOpacity="0.8"/>
      <stop offset="100%" stopColor="var(--pink)" stopOpacity="0"/>
      </radialGradient>
      <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stopColor="var(--bunny-glow)"/>
      <stop offset="100%" stopColor="var(--bunny-glow)" stopOpacity="0"/>
      </radialGradient>
      <filter id="softShadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="12" stdDeviation="10" floodColor="var(--bunny-line)" floodOpacity="0.22"/>
      </filter>
      <filter id="glowBlur" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="16"/>
      </filter>
      </defs>
      
      <ellipse cx="160" cy="188" rx="150" ry="150" fill="url(#glowGrad)" filter="url(#glowBlur)"/>
      <ellipse cx="160" cy="300" rx="108" ry="24" fill="var(--bunny-line)" opacity="0.08"/>
      
      <g filter="url(#softShadow)">
      <path d="M110 90 C95 40 75 15 95 8 C118 0 128 55 132 92 Z" fill="url(#earGrad)" stroke="var(--bunny-line)" strokeWidth="3" strokeLinejoin="round"/>
      <path d="M210 90 C225 40 245 15 225 8 C202 0 192 55 188 92 Z" fill="url(#earGrad)" stroke="var(--bunny-line)" strokeWidth="3" strokeLinejoin="round"/>
      <path d="M116 84 C106 48 92 26 104 21 C120 15 127 55 130 86 Z" fill="url(#innerEarGrad)"/>
      <path d="M204 84 C214 48 228 26 216 21 C200 15 193 55 190 86 Z" fill="url(#innerEarGrad)"/>
      
      <ellipse cx="160" cy="205" rx="95" ry="88" fill="url(#furGrad)" stroke="var(--bunny-line)" strokeWidth="3.5"/>
      <ellipse cx="160" cy="205" rx="95" ry="88" fill="url(#rimShade)"/>
      <ellipse cx="122" cy="165" rx="30" ry="17" fill="url(#shineGrad)"/>
      
      <circle cx="128" cy="196" r="7.5" fill="var(--bunny-line)"/>
      <circle cx="131" cy="193" r="2.4" fill="#fff"/>
      <circle cx="192" cy="196" r="7.5" fill="var(--bunny-line)"/>
      <circle cx="195" cy="193" r="2.4" fill="#fff"/>
      <ellipse cx="112" cy="216" rx="14" ry="9" fill="url(#cheekGrad)"/>
      <ellipse cx="208" cy="216" rx="14" ry="9" fill="url(#cheekGrad)"/>
      <path d="M152 214 q8 8 16 0" stroke="var(--bunny-line)" strokeWidth="3" fill="none" strokeLinecap="round"/>
      <path d="M160 205 l-5 8 h10 z" fill="var(--pink-deep)"/>
      <path d="M88 190 q-24 -4 -34 2 M88 198 q-26 4 -36 10 M232 190 q24 -4 34 2 M232 198 q26 4 36 10" stroke="var(--bunny-line)" strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
      <g transform="translate(160,124)">
      <path d="M-22 0 C-34 -12 -30 -22 -14 -16 C-16 -6 -10 0 0 0 C-10 0 -16 6 -14 16 C-30 22 -34 12 -22 0 Z" fill="url(#innerEarGrad)" stroke="var(--bunny-line)" strokeWidth="2.5" strokeLinejoin="round"/>
      <path d="M22 0 C34 -12 30 -22 14 -16 C16 -6 10 0 0 0 C10 0 16 6 14 16 C30 22 34 12 22 0 Z" fill="url(#innerEarGrad)" stroke="var(--bunny-line)" strokeWidth="2.5" strokeLinejoin="round"/>
      <circle cx="0" cy="0" r="5" fill="var(--pink-deep)" stroke="var(--bunny-line)" strokeWidth="2"/>
      </g>
      </g>
      </svg>
      </div>
  );
}
