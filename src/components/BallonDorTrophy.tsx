export function BallonDorTrophy({ className = 'w-48 h-64' }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <div className="absolute inset-4 rounded-full bg-amber-500/20 blur-2xl pointer-events-none" />
      <svg
        viewBox="0 0 240 310"
        className="relative w-full h-full drop-shadow-[0_18px_36px_rgba(234,179,8,0.28)]"
        aria-label="FTD Golden Ballon d'Or Trophy"
      >
        <defs>
          <radialGradient id="goldSphere" cx="38%" cy="32%" r="68%">
            <stop offset="0%" stopColor="#FFF7D6" />
            <stop offset="28%" stopColor="#FACC15" />
            <stop offset="68%" stopColor="#CA8A04" />
            <stop offset="100%" stopColor="#713F12" />
          </radialGradient>
          <linearGradient id="goldPedestal" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#854D0E" />
            <stop offset="35%" stopColor="#FDE047" />
            <stop offset="65%" stopColor="#EAB308" />
            <stop offset="100%" stopColor="#713F12" />
          </linearGradient>
          <linearGradient id="obsidianBase" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#262930" />
            <stop offset="50%" stopColor="#0E1015" />
            <stop offset="100%" stopColor="#050608" />
          </linearGradient>
        </defs>

        {/* Golden Football Sphere */}
        <circle cx="120" cy="94" r="66" fill="url(#goldSphere)" stroke="#FEF08A" strokeWidth="1.5" strokeOpacity="0.6" />

        {/* Classic Football Panel Geometry */}
        <g stroke="#78350F" strokeWidth="2.4" fill="none" strokeOpacity="0.58">
          <polygon points="120,67 141,82 133,107 107,107 99,82" fill="#92400E" fillOpacity="0.22" />
          <line x1="120" y1="67" x2="120" y2="38" />
          <line x1="141" y1="82" x2="170" y2="70" />
          <line x1="133" y1="107" x2="156" y2="132" />
          <line x1="107" y1="107" x2="84" y2="132" />
          <line x1="99" y1="82" x2="70" y2="70" />
          <path d="M92,44 L120,38 L148,44" />
          <path d="M170,70 L182,98 L156,132" />
          <path d="M70,70 L58,98 L84,132" />
          <path d="M84,132 L120,148 L156,132" />
        </g>

        {/* Specular Shine */}
        <ellipse cx="96" cy="64" rx="18" ry="10" transform="rotate(-28 96 64)" fill="#FFFFFF" fillOpacity="0.35" />

        {/* Sculpted Neck / Collar */}
        <path d="M98 156 L142 156 L132 184 L108 184 Z" fill="url(#goldPedestal)" />
        <rect x="92" y="182" width="56" height="9" rx="3" fill="url(#goldPedestal)" />

        {/* Pyrite / Obsidian Crystal Pedestal Base */}
        <polygon points="82,191 158,191 174,252 66,252" fill="url(#obsidianBase)" stroke="#CA8A04" strokeWidth="1.5" strokeOpacity="0.45" />
        <polygon points="60,252 180,252 188,284 52,284" fill="#090B0F" stroke="#FACC15" strokeWidth="1.2" strokeOpacity="0.4" />

        {/* Engraved Plaque */}
        <rect x="82" y="210" width="76" height="28" rx="3" fill="url(#goldPedestal)" />
        <text
          x="120"
          y="223"
          textAnchor="middle"
          fill="#1C1202"
          fontSize="9"
          fontWeight="800"
          fontFamily="Barlow Condensed, sans-serif"
          letterSpacing="1.6"
        >
          FTD
        </text>
        <text
          x="120"
          y="233"
          textAnchor="middle"
          fill="#1C1202"
          fontSize="8.5"
          fontWeight="700"
          fontFamily="Barlow Condensed, sans-serif"
          letterSpacing="1.2"
        >
          BALLON D&apos;OR
        </text>
      </svg>
    </div>
  );
}
