import React, { TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, disabled, rows = 3, ...props }, ref) => {
    const textareaId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-xs font-semibold text-text-secondary select-none tracking-wide"
          >
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          disabled={disabled}
          className={cn(
            'w-full bg-white border rounded-[5px] text-sm text-text-primary placeholder:text-text-muted px-3 py-2 transition-colors resize-y min-h-[70px]',
            'focus:outline-none focus:ring-1 focus:ring-copper-500 focus:border-copper-500',
            'disabled:bg-slate-50 disabled:text-text-muted disabled:cursor-not-allowed',
            error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-border',
            className
          )}
          {...props}
        />
        {error ? (
          <p className="text-xs text-red-600 font-medium">{error}</p>
        ) : hint ? (
          <p className="text-xs text-text-muted">{hint}</p>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
