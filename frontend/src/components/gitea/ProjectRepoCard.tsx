import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { GiteaRepo } from '../../types';
import { CommitList } from './CommitList';
import { Button } from '../ui/Button';
import { GitBranch, ExternalLink, Code2, History, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';

interface ProjectRepoCardProps {
  repo: GiteaRepo;
  isManagerOrAdmin: boolean;
  onUnlink: (repoId: string) => void;
}

export const ProjectRepoCard: React.FC<ProjectRepoCardProps> = ({
  repo,
  isManagerOrAdmin,
  onUnlink,
}) => {
  const [viewMode, setViewMode] = useState<'commits' | 'code'>('commits');
  const [copied, setCopied] = useState(false);

  // Fetch real commits for this repository
  const { data: commits = [], isLoading: isLoadingCommits } = useQuery({
    queryKey: ['gitea', 'commits', repo.id],
    queryFn: () => api.gitea.getCommits(repo.id, 1, 20),
    enabled: viewMode === 'commits',
  });

  const cloneUrl = `${window.location.origin}/gitea/${repo.repo_full_name}.git`;

  const handleCopy = () => {
    navigator.clipboard.writeText(cloneUrl);
    setCopied(true);
    toast.success('Clone command copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-lg border border-border shadow-subtle flex flex-col overflow-hidden">
      {/* Repo Header */}
      <div className="p-4 bg-slate-50/70 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-copper-100 text-copper-800 flex items-center justify-center font-bold">
            <GitBranch className="w-4 h-4 text-copper-700" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-text-primary">
                {repo.repo_full_name}
              </span>
              <span className="text-[10px] bg-slate-200 text-slate-700 font-mono px-2 py-0.5 rounded">
                {repo.default_branch}
              </span>
            </div>
            <p className="text-[11px] text-text-muted mt-0.5">
              Internal VCS repository linked to project firmware and hardware design files.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="inline-flex rounded-md border border-border p-0.5 bg-white text-xs">
            <button
              onClick={() => setViewMode('commits')}
              className={`px-2.5 py-1 rounded font-medium flex items-center gap-1 transition-colors ${
                viewMode === 'commits'
                  ? 'bg-copper-50 text-copper-800 font-semibold'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Commits
            </button>
            <button
              onClick={() => setViewMode('code')}
              className={`px-2.5 py-1 rounded font-medium flex items-center gap-1 transition-colors ${
                viewMode === 'code'
                  ? 'bg-copper-50 text-copper-800 font-semibold'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              Inbuilt Code View
            </button>
          </div>

          <a
            href={`/gitea/${repo.repo_full_name}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-text-secondary hover:text-text-primary inline-flex items-center gap-1 px-2 py-1"
            title="Open in new window"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          {isManagerOrAdmin && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUnlink(repo.id)}
              className="text-text-muted hover:text-red-600 ml-1"
            >
              Unlink
            </Button>
          )}
        </div>
      </div>

      {/* Clone Command Strip */}
      <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between font-mono text-xs text-slate-200">
        <div className="flex items-center gap-2 truncate mr-3">
          <span className="text-slate-500 select-none">$ git clone</span>
          <span className="text-copper-400 select-all truncate">{cloneUrl}</span>
        </div>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-sans border border-slate-700 transition-colors shrink-0"
        >
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied!' : 'Copy Clone URL'}
        </button>
      </div>

      {/* Body Content */}
      <div className="p-4">
        {viewMode === 'commits' ? (
          <div>
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
              Recent Commit Activity ({commits.length})
            </h4>
            <CommitList commits={commits} isLoading={isLoadingCommits} />
          </div>
        ) : (
          <div className="border border-border rounded overflow-hidden">
            <iframe
              src={`/gitea/${repo.repo_full_name}`}
              title={`Repository ${repo.repo_full_name}`}
              className="w-full h-[650px] border-0"
            />
          </div>
        )}
      </div>
    </div>
  );
};
