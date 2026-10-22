import React, { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      leftIcon,
      rightIcon,
      children,
      ...props
    },
    ref
  ) => {
    const baseClasses =
      'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper-500 disabled:opacity-50 disabled:pointer-events-none select-none rounded-[5px]';

    const variantClasses: Record<ButtonVariant, string> = {
      primary:
        'bg-copper-600 hover:bg-copper-700 text-white shadow-subtle border border-copper-700 active:bg-copper-800',
      secondary:
        'bg-white border border-border text-text-primary hover:bg-slate-50 active:bg-slate-100 shadow-subtle',
      ghost:
        'bg-transparent text-text-secondary hover:bg-slate-100 hover:text-text-primary active:bg-slate-200',
      danger:
        'bg-red-600 hover:bg-red-700 text-white shadow-subtle border border-red-700 active:bg-red-800',
    };

    const sizeClasses: Record<ButtonSize, string> = {
      sm: 'text-xs px-2.5 py-1.5 gap-1.5 h-7',
      md: 'text-sm px-3.5 py-2 gap-2 h-9',
      lg: 'text-base px-4 py-2.5 gap-2.5 h-11',
    };

    const spinnerColor = variant === 'secondary' || variant === 'ghost' ? 'copper' : 'white';

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
        {...props}
      >
        {isLoading ? (
          <Spinner size={size === 'lg' ? 'md' : 'sm'} color={spinnerColor} />
        ) : (
          leftIcon && <span className="inline-flex shrink-0 items-center">{leftIcon}</span>
        )}
        <span>{children}</span>
        {!isLoading && rightIcon && (
          <span className="inline-flex shrink-0 items-center">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
