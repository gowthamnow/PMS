import React from 'react';
import { TaskStatus, Priority, User } from '../../types';
import { STATUS_LABELS, PRIORITY_LABELS, KANBAN_COLUMNS } from '../../lib/constants';
import { Search, X, Filter } from 'lucide-react';
import { Button } from '../ui/Button';

export interface TaskFilterValues {
  search: string;
  status: TaskStatus[];
  priority: Priority[];
  assignee_id: string;
}

export interface TaskFiltersProps {
  filters: TaskFilterValues;
  onChange: (filters: TaskFilterValues) => void;
  users?: User[];
  className?: string;
}

export const TaskFilters: React.FC<TaskFiltersProps> = ({
  filters,
  onChange,
  users = [],
  className,
}) => {
  const priorities: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

  const hasActiveFilters =
    filters.search !== '' ||
    filters.status.length > 0 ||
    filters.priority.length > 0 ||
    filters.assignee_id !== '';

  const handleClear = () => {
    onChange({
      search: '',
      status: [],
      priority: [],
      assignee_id: '',
    });
  };

  const toggleStatus = (st: TaskStatus) => {
    const exists = filters.status.includes(st);
    const newStatus = exists
      ? filters.status.filter((s) => s !== st)
      : [...filters.status, st];
    onChange({ ...filters, status: newStatus });
  };

  const togglePriority = (pr: Priority) => {
    const exists = filters.priority.includes(pr);
    const newPriority = exists
      ? filters.priority.filter((p) => p !== pr)
      : [...filters.priority, pr];
    onChange({ ...filters, priority: newPriority });
  };

  return (
    <div className={`flex flex-col gap-3 bg-white p-3.5 border border-border rounded-lg shadow-subtle ${className || ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by title, number, or description..."
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-copper-500 focus:bg-white transition-colors"
          />
          {filters.search && (
            <button
              onClick={() => onChange({ ...filters, search: '' })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Assignee Select */}
        <div className="min-w-[160px]">
          <select
            value={filters.assignee_id}
            onChange={(e) => onChange({ ...filters, assignee_id: e.target.value })}
            className="w-full text-xs bg-white border border-border rounded-md px-2.5 py-1.5 text-text-secondary focus:outline-none focus:ring-1 focus:ring-copper-500 cursor-pointer"
          >
            <option value="">All Assignees</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </div>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="text-text-muted hover:text-red-600 gap-1"
          >
            <X className="w-3.5 h-3.5" />
            Clear Filters
          </Button>
        )}
      </div>

      {/* Badges Filter Row */}
      <div className="flex flex-wrap items-center gap-4 text-xs pt-2 border-t border-slate-100">
        {/* Status filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mr-1">
            Status:
          </span>
          {KANBAN_COLUMNS.map((st) => {
            const active = filters.status.includes(st);
            return (
              <button
                key={st}
                type="button"
                onClick={() => toggleStatus(st)}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                  active
                    ? 'bg-copper-600 text-white border-copper-700 font-semibold'
                    : 'bg-slate-50 text-text-secondary border-border hover:bg-slate-100'
                }`}
              >
                {STATUS_LABELS[st]}
              </button>
            );
          })}
        </div>

        {/* Priority filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mr-1">
            Priority:
          </span>
          {priorities.map((pr) => {
            const active = filters.priority.includes(pr);
            return (
              <button
                key={pr}
                type="button"
                onClick={() => togglePriority(pr)}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                  active
                    ? 'bg-copper-600 text-white border-copper-700 font-semibold'
                    : 'bg-slate-50 text-text-secondary border-border hover:bg-slate-100'
                }`}
              >
                {PRIORITY_LABELS[pr]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
