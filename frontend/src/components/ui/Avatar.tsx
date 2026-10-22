import React from 'react';
import { cn, getInitials } from '../../lib/utils';

export interface AvatarProps {
  name?: string;
  src?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  status?: 'online' | 'busy' | 'offline';
}

export const Avatar: React.FC<AvatarProps> = ({
  name = 'User',
  src,
  size = 'md',
  className,
  status,
}) => {
  const sizeClasses = {
    xs: 'w-5 h-5 text-[10px]',
    sm: 'w-7 h-7 text-xs',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
    xl: 'w-12 h-12 text-base',
  };

  const statusIndicatorClasses = {
    online: 'bg-green-500',
    busy: 'bg-amber-500',
    offline: 'bg-slate-400',
  };

  const initials = getInitials(name);

  // Derive subtle background color from initials hash to vary user avatars slightly
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const bgColors = [
    'bg-slate-100 text-slate-700 border-slate-200',
    'bg-stone-100 text-stone-700 border-stone-200',
    'bg-amber-50 text-amber-800 border-amber-200',
    'bg-blue-50 text-blue-800 border-blue-200',
    'bg-zinc-100 text-zinc-700 border-zinc-200',
  ];
  const colorClass = bgColors[hash % bgColors.length];

  return (
    <div className="relative inline-flex shrink-0">
      <div
        title={name}
        className={cn(
          'rounded-full flex items-center justify-center font-semibold font-mono tracking-wider border select-none overflow-hidden uppercase',
          sizeClasses[size],
          colorClass,
          className
        )}
      >
        {src ? (
          <img src={src} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
      </div>
      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white',
            statusIndicatorClasses[status]
          )}
          aria-hidden="true"
        />
      )}
    </div>
  );
};
