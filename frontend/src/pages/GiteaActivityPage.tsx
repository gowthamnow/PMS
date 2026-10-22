import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { GiteaRepo, Task } from '../types';
import { CommitList } from '../components/gitea/CommitList';
import { PullRequestList } from '../components/gitea/PullRequestList';
import { ProjectRepoCard } from '../components/gitea/ProjectRepoCard';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  FolderGit2,
  Terminal,
  Copy,
  Check,
  Send,
  Link as LinkIcon,
  Globe,
  Sparkles,
  Maximize2,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const GiteaActivityPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'hub' | 'push_assistant' | 'activity'>('hub');
  const [hubPath, setHubPath] = useState<string>('/gitea/');
  const [iframeKey, setIframeKey] = useState<number>(1);

  // Push Assistant States
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [commitMessage, setCommitMessage] = useState<string>('Updated hardware firmware driver');
  const [commitSha, setCommitSha] = useState<string>('');
  const [branchName, setBranchName] = useState<string>('main');
  const [copiedCmd, setCopiedCmd] = useState<boolean>(false);

  // Fetch Projects for filter & assistant
  const { data: projectsData } = useQuery({
    queryKey: ['projects', { page: 1, page_size: 50 }],
    queryFn: () => api.projects.getProjects({ page: 1, page_size: 50 }),
  });

  // Fetch Repos
  const {
    data: repos = [],
    isLoading: isLoadingRepos,
    error,
    refetch: refetchRepos,
  } = useQuery({
    queryKey: ['gitea', 'repos', { project_id: selectedProjectId }],
    queryFn: () => api.gitea.getRepos(selectedProjectId || undefined),
  });

  // Fetch Tasks for the selected project
  const { data: projectTasksData } = useQuery({
    queryKey: ['tasks', { project_id: selectedProjectId, page: 1, page_size: 50 }],
    queryFn: () =>
      api.tasks.getTasks({
        project_id: selectedProjectId || undefined,
        page: 1,
        page_size: 50,
      }),
    enabled: !!selectedProjectId,
  });

  const tasks: Task[] = projectTasksData?.items || [];
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  // Generated CLI Push Command
  const taskRefTag = selectedTask ? `#${selectedTask.task_number}` : '#ENG';
  const generatedCommand = `git add . && git commit -m "${taskRefTag} ${commitMessage}" && git push origin ${branchName}`;

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(generatedCommand);
    setCopiedCmd(true);
    toast.success('Terminal command copied to clipboard!');
    setTimeout(() => setCopiedCmd(false), 2500);
  };

  // Submit Git Ref manually
  const [isLinkingRef, setIsLinkingRef] = useState(false);
  const handleRecordGitPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskId) {
      toast.error('Please select a task to link this push to.');
      return;
    }
    setIsLinkingRef(true);
    try {
      await api.tasks.addGitRef(selectedTaskId, {
        commit_sha: commitSha || Math.random().toString(16).substring(2, 10),
        branch: branchName,
        message: commitMessage,
      });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Git push reference linked to task!');
      setCommitSha('');
    } catch {
      toast.error('Failed to link git reference');
    } finally {
      setIsLinkingRef(false);
    }
  };

  if (error) {
    return (
      <ErrorState
        title="Could not load Gitea activity"
        message="Please check Gitea connection settings."
        onRetry={refetchRepos}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-text-primary tracking-tight">Code VCS &amp; Inbuilt Gitea</h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-blue-100 text-blue-800 border border-blue-200">
              Integrated Git
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            Internal Git repository management, web code browsing, terminal push commands, and task commit tracking.
          </p>
        </div>

        {/* View Mode Navigation Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setViewMode('hub')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
              viewMode === 'hub'
                ? 'bg-white shadow-xs text-copper-800'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-copper-600" />
            <span>Inbuilt Gitea Web Hub</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('push_assistant')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
              viewMode === 'push_assistant'
                ? 'bg-white shadow-xs text-copper-800'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-blue-600" />
            <span>Git Push Assistant</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('activity')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
              viewMode === 'activity'
                ? 'bg-white shadow-xs text-copper-800'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <GitCommit className="w-3.5 h-3.5 text-emerald-600" />
            <span>Commit Feeds</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: INBUILT GITEA WEB HUB (EMBEDDED IFRAME)           */}
      {/* ======================================================== */}
      {viewMode === 'hub' && (
        <div className="flex flex-col gap-3">
          {/* Hub Navigation Bar */}
          <div className="bg-white p-3 rounded-xl border border-border shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text-secondary">Quick Browse:</span>
              <button
                type="button"
                onClick={() => setHubPath('/gitea/explore/repos')}
                className="px-2.5 py-1 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 text-text-primary font-mono text-[11px]"
              >
                Explore Repos
              </button>
              <button
                type="button"
                onClick={() => setHubPath('/gitea/giteaadmin/firmware-core')}
                className="px-2.5 py-1 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 text-copper-700 font-mono text-[11px]"
              >
                firmware-core.git
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIframeKey((k) => k + 1)}
                className="p-1.5 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 text-text-muted hover:text-text-primary"
                title="Reload Inbuilt Gitea"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <a
                href={hubPath}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-semibold inline-flex items-center gap-1.5"
              >
                <span>Pop Out Window</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Embedded Gitea Web Hub Frame */}
          <div className="rounded-2xl border border-slate-200 shadow-lg overflow-hidden bg-white">
            <iframe
              key={iframeKey}
              src={hubPath}
              title="Embedded Gitea Web Portal"
              className="w-full h-[760px] border-none"
            />
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: GIT PUSH & COMMIT ASSISTANT                       */}
      {/* ======================================================== */}
      {viewMode === 'push_assistant' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left Column: Terminal Command Builder */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100">
                <Terminal className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-text-primary text-sm">Terminal Push Command Generator</h3>
              </div>

              <div className="flex flex-col gap-3 text-xs">
                {/* 1. Select Project */}
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Target Project:</label>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => {
                      setSelectedProjectId(e.target.value);
                      setSelectedTaskId('');
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-copper-500"
                  >
                    <option value="">-- Choose Project --</option>
                    {(projectsData?.items || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Select Task */}
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Associate with Task:</label>
                  <select
                    value={selectedTaskId}
                    onChange={(e) => setSelectedTaskId(e.target.value)}
                    disabled={!selectedProjectId}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-copper-500 disabled:opacity-50"
                  >
                    <option value="">-- Choose Task to update --</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        #{t.task_number} - {t.title} ({t.status})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Branch & Commit Message */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <label className="font-semibold text-text-secondary block mb-1">Branch:</label>
                    <input
                      type="text"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-text-primary font-mono"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="font-semibold text-text-secondary block mb-1">Work Description:</label>
                    <input
                      type="text"
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder="e.g. Added SPI telemetry driver"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-text-primary"
                    />
                  </div>
                </div>

                {/* Generated Terminal Box */}
                <div className="mt-3">
                  <label className="font-semibold text-text-secondary block mb-1.5">
                    Terminal Command (Run in your local repository):
                  </label>
                  <div className="p-3.5 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs flex items-center justify-between gap-3 shadow-inner">
                    <span className="truncate selection:bg-amber-500 selection:text-black">
                      {generatedCommand}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyCommand}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 font-sans font-semibold inline-flex items-center gap-1.5 transition-colors shrink-0"
                    >
                      {copiedCmd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCmd ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-text-muted mt-1.5">
                    Gitea webhooks will automatically detect the commit `#number` and link it to PMS.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Direct Git Push Linker Form */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100">
                <LinkIcon className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-text-primary text-sm">Record Commit Directly into PMS</h3>
              </div>
              <p className="text-xs text-text-muted mb-4">
                Already pushed your code? Record the commit hash or message directly onto the task so your Project Manager and team can see it.
              </p>

              <form onSubmit={handleRecordGitPush} className="flex flex-col gap-3 text-xs">
                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Commit Hash (SHA):</label>
                  <input
                    type="text"
                    value={commitSha}
                    onChange={(e) => setCommitSha(e.target.value)}
                    placeholder="e.g. 7b9a4c12 or full 40-char SHA"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-text-primary font-mono"
                  />
                </div>

                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Target Task:</label>
                  <select
                    value={selectedTaskId}
                    onChange={(e) => setSelectedTaskId(e.target.value)}
                    disabled={!selectedProjectId}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-copper-500 disabled:opacity-50"
                  >
                    <option value="">-- Choose Task --</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        #{t.task_number} - {t.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-text-secondary block mb-1">Commit Summary Note:</label>
                  <textarea
                    rows={3}
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-copper-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLinkingRef || !selectedTaskId}
                  className="mt-2 py-2.5 px-4 rounded-xl bg-copper-600 hover:bg-copper-700 disabled:opacity-50 text-white font-semibold text-xs inline-flex items-center justify-center gap-2 shadow-xs transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isLinkingRef ? 'Recording...' : 'Record Commit on Task'}</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: ACTIVITY & COMMIT FEEDS                           */}
      {/* ======================================================== */}
      {viewMode === 'activity' && (
        <div className="flex flex-col gap-4">
          {isLoadingRepos ? (
            <div className="py-12 flex justify-center"><Spinner size="md" /></div>
          ) : repos.length === 0 ? (
            <EmptyState
              heading="No Git repositories linked"
              description="Link a repository in Project Details -> Git Repositories."
              icon={<FolderGit2 className="w-10 h-10 text-slate-300" />}
            />
          ) : (
            repos.map((repo) => (
              <ProjectRepoCard
                key={repo.id}
                repo={repo}
                isManagerOrAdmin={true}
                onUnlink={() => {}}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};
