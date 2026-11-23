import { useState } from 'react';

interface TeamCrestProps {
  name: string;
  shortName: string;
  logoUrl?: string;
  primaryColor?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'w-7 h-7 text-[10px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-14 h-14 text-sm',
  xl: 'w-20 h-20 text-lg',
};

export function TeamCrest({
  name,
  shortName,
  logoUrl,
  primaryColor = '#FFFFFF',
  size = 'md',
}: TeamCrestProps) {
  const [imgError, setImgError] = useState(false);

  if (logoUrl && !imgError) {
    return (
      <div
        className={`${sizeClasses[size]} rounded-lg overflow-hidden bg-black/50 border border-white/15 flex items-center justify-center shrink-0 p-1`}
      >
        <img
          src={logoUrl}
          alt={`${name} crest`}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} relative flex items-center justify-center shrink-0 select-none`}
      aria-label={`${name} crest`}
    >
      <svg viewBox="0 0 64 72" className="w-full h-full drop-shadow-md">
        <path
          d="M8 8 L56 8 L56 36 C56 52 32 66 32 66 C32 66 8 52 8 36 Z"
          fill="#0B0E14"
          stroke={primaryColor}
          strokeWidth="3.5"
        />
        <path
          d="M14 14 L50 14 L50 35 C50 47 32 58 32 58 C32 58 14 47 14 35 Z"
          fill={primaryColor}
          fillOpacity="0.14"
        />
        <path d="M14 26 L50 26" stroke={primaryColor} strokeWidth="2" strokeOpacity="0.45" />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-display font-extrabold tracking-wider text-white pt-1"
      >
        {shortName.slice(0, 3)}
      </span>
    </div>
  );
}
