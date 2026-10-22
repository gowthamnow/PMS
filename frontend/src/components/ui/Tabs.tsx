import React from 'react';
import { cn } from '../../lib/utils';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onChange, className }) => {
  return (
    <div className={cn('border-b border-border flex items-center gap-6 overflow-x-auto', className)}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              'group inline-flex items-center gap-2 py-3 px-1 text-sm font-medium border-b-2 transition-all whitespace-nowrap focus:outline-none',
              isActive
                ? 'border-copper-600 text-copper-700 font-semibold'
                : 'border-transparent text-text-secondary hover:text-text-primary hover:border-slate-300'
            )}
          >
            {tab.icon && (
              <span
                className={cn(
                  'shrink-0',
                  isActive ? 'text-copper-600' : 'text-text-muted group-hover:text-text-secondary'
                )}
              >
                {tab.icon}
              </span>
            )}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={cn(
                  'ml-1 text-xs px-1.5 py-0.5 rounded-full font-mono',
                  isActive
                    ? 'bg-copper-100 text-copper-800'
                    : 'bg-slate-100 text-text-muted group-hover:bg-slate-200'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
