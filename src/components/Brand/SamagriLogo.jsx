export default function SamagriLogo({ className = '', title = 'Samagri logo', style }) {
  return (
    <svg
      viewBox="0 0 220 220"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
      style={style}
    >
      <title>{title}</title>

      {/* Pestle */}
      <g transform="translate(120 20) rotate(32)">
        <rect x="10" y="12" width="32" height="110" rx="15" fill="#efe4cb" stroke="#d8be7a" strokeWidth="4" />
        <circle cx="26" cy="14" r="16" fill="#efe4cb" stroke="#d8be7a" strokeWidth="4" />
      </g>

      {/* Bowl */}
      <path
        d="M32 90 Q110 58 188 90 L176 152 Q173 172 154 182 L66 182 Q47 172 44 152 Z"
        fill="#6f7418"
        stroke="#d8be7a"
        strokeWidth="5"
        strokeLinejoin="round"
      />

      {/* Bowl opening */}
      <ellipse cx="110" cy="90" rx="74" ry="14" fill="#303411" stroke="#d8be7a" strokeWidth="4" />

      {/* Face */}
      <circle cx="82" cy="124" r="10" fill="#363636" stroke="#d8be7a" strokeWidth="3" />
      <circle cx="138" cy="124" r="10" fill="#363636" stroke="#d8be7a" strokeWidth="3" />
      <path d="M95 142 Q110 158 125 142" fill="none" stroke="#d8be7a" strokeWidth="5" strokeLinecap="round" />

      {/* Base */}
      <rect x="58" y="186" width="104" height="20" rx="10" fill="#6f7418" stroke="#d8be7a" strokeWidth="4" />
    </svg>
  )
}
