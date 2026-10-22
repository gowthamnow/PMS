import React, { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';
import { Calendar } from 'lucide-react';

export interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  hint?: string;
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  ({ className, label, error, hint, id, disabled, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-semibold text-text-secondary select-none tracking-wide"
          >
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative flex items-center">
          <input
            ref={ref}
            type="date"
            id={inputId}
            disabled={disabled}
            className={cn(
              'w-full bg-white border rounded-[5px] text-sm text-text-primary px-3 py-2 transition-colors cursor-pointer',
              'focus:outline-none focus:ring-1 focus:ring-copper-500 focus:border-copper-500',
              'disabled:bg-slate-50 disabled:text-text-muted disabled:cursor-not-allowed',
              error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-border',
              className
            )}
            {...props}
          />
          <div className="absolute right-3 pointer-events-none text-text-muted">
            <Calendar className="w-4 h-4" />
          </div>
        </div>
        {error ? (
          <p className="text-xs text-red-600 font-medium">{error}</p>
        ) : hint ? (
          <p className="text-xs text-text-muted">{hint}</p>
        ) : null}
      </div>
    );
  }
);

DatePicker.displayName = 'DatePicker';
