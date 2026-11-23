import { useState } from 'react';

interface PlayerAvatarProps {
  name: string;
  kitNumber: number;
  imageUrl?: string;
  accent?: 'gold' | 'white';
  className?: string;
}

export function PlayerAvatar({
  name,
  kitNumber,
  imageUrl,
  accent = 'white',
  className = 'w-full h-56',
}: PlayerAvatarProps) {
  const [failed, setFailed] = useState(false);

  if (imageUrl && !failed) {
    return (
      <div className={`relative overflow-hidden bg-[#0A0C10] ${className}`}>
        <img
          src={imageUrl}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D12] via-transparent to-transparent" />
      </div>
    );
  }

  const strokeColor = accent === 'gold' ? '#F5C451' : '#FFFFFF';

  return (
    <div
      className={`relative overflow-hidden flex items-end justify-center bg-gradient-to-b from-[#161B24] via-[#0E1117] to-[#080A0E] ${className}`}
    >
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            accent === 'gold'
              ? 'radial-gradient(circle at 50% 25%, rgba(245,196,81,0.55), transparent 68%)'
              : 'radial-gradient(circle at 50% 25%, rgba(255,255,255,0.35), transparent 68%)',
        }}
      />
      <span className="absolute top-3 right-4 font-display text-4xl font-extrabold text-white/15 tabular-nums select-none">
        {kitNumber}
      </span>
      <svg
        viewBox="0 0 180 180"
        className="w-40 h-40 translate-y-2 relative z-10"
        aria-label={`${name} player kit silhouette`}
      >
        <circle cx="90" cy="48" r="24" fill="#1E2532" stroke={strokeColor} strokeOpacity="0.45" strokeWidth="2" />
        <path
          d="M36 168 C36 122 52 94 74 88 L90 100 L106 88 C128 94 144 122 144 168 Z"
          fill="#151A24"
          stroke={strokeColor}
          strokeOpacity="0.55"
          strokeWidth="2.2"
        />
        <path d="M74 88 L90 104 L106 88" fill="none" stroke={strokeColor} strokeWidth="2.5" />
        <text
          x="90"
          y="142"
          textAnchor="middle"
          fill={strokeColor}
          fillOpacity="0.88"
          fontSize="26"
          fontWeight="800"
          fontFamily="Barlow Condensed, sans-serif"
        >
          {kitNumber}
        </text>
      </svg>
    </div>
  );
}
