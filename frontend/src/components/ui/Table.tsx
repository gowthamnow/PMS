import React from 'react';
import { cn } from '../../lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (item: T, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  skeletonRowCount?: number;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  onRowClick?: (item: T) => void;
  rowKey?: (item: T, index: number) => string | number;
  // Pagination
  page?: number;
  totalPages?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;
  className?: string;
}

export function Table<T>({
  columns,
  data,
  isLoading = false,
  skeletonRowCount = 5,
  emptyMessage = 'No records found.',
  emptyIcon,
  onRowClick,
  rowKey,
  page,
  totalPages,
  totalCount,
  onPageChange,
  className,
}: TableProps<T>) {
  return (
    <div className={cn('w-full flex flex-col bg-white border border-border rounded-lg overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50/80">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-2.5 text-xs font-semibold text-text-secondary uppercase tracking-wider select-none whitespace-nowrap',
                    col.headerClassName
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              Array.from({ length: skeletonRowCount }).map((_, rIdx) => (
                <tr key={`skeleton-${rIdx}`} className="animate-pulse">
                  {columns.map((col, cIdx) => (
                    <td key={`skeleton-cell-${cIdx}`} className="px-4 py-3">
                      <div className="h-4 bg-slate-200 rounded w-4/5" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-text-muted">
                  <div className="flex flex-col items-center justify-center gap-2">
                    {emptyIcon}
                    <p className="text-sm font-medium text-text-secondary">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((item, idx) => {
                const key = rowKey ? rowKey(item, idx) : idx;
                return (
                  <tr
                    key={key}
                    onClick={() => onRowClick?.(item)}
                    className={cn(
                      'transition-colors',
                      onRowClick ? 'cursor-pointer hover:bg-slate-50/80' : 'hover:bg-slate-50/40'
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn('px-4 py-3 text-text-primary whitespace-nowrap', col.className)}
                      >
                        {col.render ? col.render(item, idx) : (item as any)[col.key]}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {totalPages !== undefined && totalPages > 1 && (
        <div className="px-4 py-2.5 border-t border-border bg-slate-50/50 flex items-center justify-between text-xs text-text-secondary">
          <div>
            {totalCount !== undefined ? (
              <span>
                Total <strong className="font-semibold text-text-primary">{totalCount}</strong> entries
              </span>
            ) : (
              <span>
                Page <strong className="font-semibold text-text-primary">{page}</strong> of{' '}
                <strong className="font-semibold text-text-primary">{totalPages}</strong>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === undefined || page <= 1}
              onClick={() => onPageChange?.((page || 1) - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </Button>
            <span className="px-2 font-medium text-text-primary">
              {page} / {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page === undefined || page >= totalPages}
              onClick={() => onPageChange?.((page || 1) + 1)}
              aria-label="Next page"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
