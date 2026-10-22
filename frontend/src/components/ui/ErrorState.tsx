import React from 'react';
import { cn } from '../../lib/utils';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Failed to load data',
  message = 'An unexpected error occurred while communicating with the server.',
  onRetry,
  className,
}) => {
  return (
    <div
      className={cn(
        'w-full py-10 px-6 flex flex-col items-center justify-center text-center border border-red-200 bg-red-50/40 rounded-lg',
        className
      )}
    >
      <div className="w-11 h-11 rounded-full bg-red-100 border border-red-200 flex items-center justify-center text-red-600 mb-3">
        <AlertTriangle className="w-5 h-5" />
      </div>
      <h4 className="text-sm font-semibold text-text-primary tracking-tight">{title}</h4>
      <p className="text-xs text-text-secondary max-w-sm mt-1 leading-relaxed">{message}</p>
      {onRetry && (
        <div className="mt-4">
          <Button
            size="sm"
            variant="secondary"
            onClick={onRetry}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
};
