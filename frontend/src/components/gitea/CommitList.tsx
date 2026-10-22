import React from 'react';
import { GiteaCommit } from '../../types';
import { GitCommit, ExternalLink } from 'lucide-react';
import { formatRelativeTime } from '../../lib/utils';
import { Spinner } from '../ui/Spinner';

export interface CommitListProps {
  commits: GiteaCommit[];
  isLoading?: boolean;
}

export const CommitList: React.FC<CommitListProps> = ({ commits, isLoading = false }) => {
  if (isLoading) {
    return (
      <div className="py-8 flex items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-text-muted italic border border-dashed border-border rounded-md">
        No recent commits recorded.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border border border-border rounded-md bg-white overflow-hidden text-xs">
      {commits.map((commit) => (
        <div
          key={commit.id || commit.sha}
          className="p-3 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <GitCommit className="w-4 h-4 text-copper-600 shrink-0 mt-0.5" />
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-text-primary bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                  {commit.sha.slice(0, 7)}
                </span>
                <span className="font-medium text-text-primary truncate">
                  {commit.message}
                </span>
              </div>
              <span className="text-[11px] text-text-muted mt-0.5">
                by <strong className="text-text-secondary">{commit.author}</strong> &bull;{' '}
                {formatRelativeTime(commit.timestamp)}
              </span>
            </div>
          </div>

          {commit.url && (
            <a
              href={commit.url}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 text-text-muted hover:text-copper-700 hover:bg-copper-50 rounded transition-colors shrink-0"
              title="Open commit on Gitea"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      ))}
    </div>
  );
};
