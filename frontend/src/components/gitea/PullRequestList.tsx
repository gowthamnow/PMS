import React from 'react';
import { GiteaPullRequest } from '../../types';
import { GitPullRequest, ExternalLink } from 'lucide-react';
import { formatRelativeTime } from '../../lib/utils';
import { Spinner } from '../ui/Spinner';

export interface PullRequestListProps {
  pullRequests: GiteaPullRequest[];
  isLoading?: boolean;
}

export const PullRequestList: React.FC<PullRequestListProps> = ({
  pullRequests,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="py-8 flex items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  if (pullRequests.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-text-muted italic border border-dashed border-border rounded-md">
        No pull requests found.
      </div>
    );
  }

  const stateBadges = {
    open: 'bg-green-50 text-green-700 border-green-200',
    merged: 'bg-violet-50 text-violet-700 border-violet-200',
    closed: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <div className="divide-y divide-border border border-border rounded-md bg-white overflow-hidden text-xs">
      {pullRequests.map((pr) => (
        <div
          key={pr.id || pr.number}
          className="p-3 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <GitPullRequest
              className={`w-4 h-4 shrink-0 mt-0.5 ${
                pr.state === 'merged'
                  ? 'text-violet-600'
                  : pr.state === 'open'
                  ? 'text-green-600'
                  : 'text-red-500'
              }`}
            />
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-text-muted">
                  #{pr.number}
                </span>
                <span className="font-medium text-text-primary truncate">{pr.title}</span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider ${
                    stateBadges[pr.state] || stateBadges.open
                  }`}
                >
                  {pr.state}
                </span>
              </div>
              <span className="text-[11px] text-text-muted mt-0.5">
                opened by <strong className="text-text-secondary">{pr.author}</strong> &bull;{' '}
                updated {formatRelativeTime(pr.updated_at)}
              </span>
            </div>
          </div>

          {pr.url && (
            <a
              href={pr.url}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 text-text-muted hover:text-copper-700 hover:bg-copper-50 rounded transition-colors shrink-0"
              title="View Pull Request on Gitea"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      ))}
    </div>
  );
};
