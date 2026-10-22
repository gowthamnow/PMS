import React from 'react';
import { cn } from '../../lib/utils';

export interface ProgressBarProps {
  value: number; // 0 to 100
  max?: number;
  label?: string;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'copper' | 'blue' | 'green' | 'amber';
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  label,
  showPercentage = true,
  size = 'md',
  variant = 'copper',
  className,
}) => {
  const percentage = Math.min(100, Math.max(0, Math.round((value / max) * 100)));

  const sizeClasses = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3',
  };

  const variantClasses = {
    copper: 'bg-copper-600',
    blue: 'bg-blue-600',
    green: 'bg-green-600',
    amber: 'bg-amber-600',
  };

  return (
    <div className={cn('w-full flex flex-col gap-1', className)}>
      {(label || showPercentage) && (
        <div className="flex items-center justify-between text-xs text-text-secondary">
          {label && <span className="font-medium text-text-primary">{label}</span>}
          {showPercentage && <span className="font-mono text-text-muted">{percentage}%</span>}
        </div>
      )}
      <div className={cn('w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/60', sizeClasses[size])}>
        <div
          className={cn('h-full transition-all duration-300 rounded-full', variantClasses[variant])}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
    </div>
  );
};
