import React from 'react';
import { cn } from '../../lib/utils';

export interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  color?: 'copper' | 'white' | 'slate';
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  className,
  color = 'copper',
}) => {
  const sizeClasses = {
    xs: 'w-3 h-3 border-[1.5px]',
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-[2.5px]',
  };

  const colorClasses = {
    copper: 'border-copper-600 border-t-transparent',
    white: 'border-white border-t-transparent',
    slate: 'border-slate-400 border-t-transparent',
  };

  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        'animate-spin rounded-full inline-block',
        sizeClasses[size],
        colorClasses[color],
        className
      )}
    />
  );
};
