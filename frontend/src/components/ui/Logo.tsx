import React from 'react';
import { cn } from '../../lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({
  size = 'md',
  showText = true,
  className,
}) => {
  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-12 h-12',
  };

  const titleSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-lg',
  };

  const subSizes = {
    sm: 'text-[9px]',
    md: 'text-[10px]',
    lg: 'text-xs',
  };

  return (
    <div className={cn('flex items-center gap-2.5 select-none group', className)}>
      {/* Sleek Hardware Vector Emblem */}
      <div
        className={cn(
          'relative rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 group-hover:scale-105 overflow-hidden bg-gradient-to-br from-amber-600 via-amber-700 to-slate-900 p-1.5 border border-amber-400/40',
          iconSizes[size]
        )}
      >
        {/* Glowing Circuit Lines SVG */}
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full text-white"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Outer Octagon Edge */}
          <polygon
            points="30,5 70,5 95,30 95,70 70,95 30,95 5,70 5,30"
            stroke="#FDE68A"
            strokeWidth="3.5"
            strokeOpacity="0.8"
            fill="none"
          />
          {/* Inner Traces */}
          <line x1="50" y1="5" x2="50" y2="28" stroke="#FDE68A" strokeWidth="3" />
          <line x1="50" y1="72" x2="50" y2="95" stroke="#FDE68A" strokeWidth="3" />
          <line x1="5" y1="50" x2="28" y2="50" stroke="#FDE68A" strokeWidth="3" />
          <line x1="72" y1="50" x2="95" y2="50" stroke="#FDE68A" strokeWidth="3" />
          {/* Corner Traces */}
          <line x1="18" y1="18" x2="35" y2="35" stroke="#FBBF24" strokeWidth="2.5" />
          <line x1="82" y1="18" x2="65" y2="35" stroke="#FBBF24" strokeWidth="2.5" />
          <line x1="18" y1="82" x2="35" y2="65" stroke="#FBBF24" strokeWidth="2.5" />
          <line x1="82" y1="82" x2="65" y2="65" stroke="#FBBF24" strokeWidth="2.5" />
          {/* Center Microchip Core */}
          <rect
            x="34"
            y="34"
            width="32"
            height="32"
            rx="6"
            fill="#FFFFFF"
            className="drop-shadow-xs"
          />
          {/* Pulse Node Core */}
          <circle cx="50" cy="50" r="7" fill="#D97706" />
          <circle cx="50" cy="50" r="3.5" fill="#FFFFFF" />
        </svg>
      </div>

      {/* Brand Typography */}
      {showText && (
        <div className="flex flex-col min-w-0 leading-none">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'font-extrabold tracking-tight text-slate-900 group-hover:text-amber-700 transition-colors',
                titleSizes[size]
              )}
            >
              ENGINEERING<span className="text-amber-600 ml-1">PMS</span>
            </span>
          </div>
          <span
            className={cn(
              'font-mono tracking-widest uppercase text-slate-500 font-semibold mt-1',
              subSizes[size]
            )}
          >
            PCB &bull; HW &bull; FIRMWARE
          </span>
        </div>
      )}
    </div>
  );
};

export default Logo;
