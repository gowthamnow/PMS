import React from 'react';
import { cn } from '../../lib/utils';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  PROJECT_STATUS_COLORS,
  PROJECT_STATUS_LABELS,
  ROLE_COLORS,
} from '../../lib/constants';
import { TaskStatus, Priority, ProjectStatus, UserRole } from '../../types';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'status' | 'priority' | 'project' | 'role' | 'neutral' | 'copper';
  value?: string;
  size?: 'sm' | 'md';
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  value,
  size = 'sm',
  dot = false,
  className,
  children,
  ...props
}) => {
  let colorClass = 'bg-slate-100 text-slate-700 border-slate-200';
  let label = children || value;

  if (variant === 'status' && value) {
    colorClass = STATUS_COLORS[value as TaskStatus] || colorClass;
    if (!children) label = STATUS_LABELS[value as TaskStatus] || value;
  } else if (variant === 'priority' && value) {
    colorClass = PRIORITY_COLORS[value as Priority] || colorClass;
    if (!children) label = PRIORITY_LABELS[value as Priority] || value;
  } else if (variant === 'project' && value) {
    colorClass = PROJECT_STATUS_COLORS[value as ProjectStatus] || colorClass;
    if (!children) label = PROJECT_STATUS_LABELS[value as ProjectStatus] || value;
  } else if (variant === 'role' && value) {
    colorClass = ROLE_COLORS[value as UserRole] || colorClass;
  } else if (variant === 'copper') {
    colorClass = 'bg-copper-50 text-copper-800 border-copper-200 font-medium';
  }

  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 leading-tight tracking-wide',
    md: 'text-xs px-2.5 py-1 leading-normal',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium border rounded-[4px] whitespace-nowrap select-none',
        colorClass,
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0 bg-current opacity-80"
          aria-hidden="true"
        />
      )}
      {label}
    </span>
  );
};
