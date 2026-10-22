import React from 'react';
import { cn } from '../../lib/utils';
import { Button, ButtonProps } from './Button';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  heading: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    leftIcon?: React.ReactNode;
    variant?: ButtonProps['variant'];
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  heading,
  description,
  action,
  className,
}) => {
  return (
    <div
      className={cn(
        'w-full py-12 px-6 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-lg bg-white/60',
        className
      )}
    >
      <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-text-muted mb-3">
        {icon || <Inbox className="w-6 h-6 text-slate-400" />}
      </div>
      <h4 className="text-sm font-semibold text-text-primary tracking-tight">{heading}</h4>
      {description && (
        <p className="text-xs text-text-secondary max-w-sm mt-1 leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-4">
          <Button
            size="sm"
            variant={action.variant || 'primary'}
            onClick={action.onClick}
            leftIcon={action.leftIcon}
          >
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
};
