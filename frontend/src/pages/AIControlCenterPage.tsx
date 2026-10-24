import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { AIControlCenterStats, AIEngineConfig, AITaskExecution } from '../types';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { AIExecutionDetailModal } from '../components/ai/AIExecutionDetailModal';
import {
  Bot,
  Cpu,
  Sparkles,
  GitPullRequest,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Play,
  RotateCcw,
  Key,
  GitBranch,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Layers,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const AIControlCenterPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isTriggerModalOpen, setIsTriggerModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [selectedAutonomy, setSelectedAutonomy] = useState(2);

  // Poll stats every 5 seconds
  const { data: stats, isLoading: isLoadingStats } = useQuery<AIControlCenterStats>({
    queryKey: ['ai-control-center'],
    queryFn: () => api.aiOrchestrator.getControlCenterStats(),
    refetchInterval: 5000,
  });

  // Fetch AI Config
  const { data: config } = useQuery<AIEngineConfig>({
    queryKey: ['ai-config'],
    queryFn: () => api.aiOrchestrator.getConfig(),
  });

  // Fetch tasks for trigger dropdown
  const { data: tasksData } = useQuery({
    queryKey: ['tasks', { page: 1, page_size: 50 }],
    queryFn: () => api.tasks.getTasks({ page: 1, page_size: 50 }),
  });

  // Launch AI Execution Mutation
  const launchMutation = useMutation({
    mutationFn: (taskId: string) =>
      api.aiOrchestrator.createExecution({
        task_id: taskId,
        autonomy_level: selectedAutonomy,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-control-center'] });
      setIsTriggerModalOpen(false);
      setSelectedTaskId('');
      toast.success('AI Autonomous Engine launched on task!');
      setSelectedExecutionId(data.id);
      setIsDetailModalOpen(true);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to trigger AI execution');
    },
  });

  const handleOpenDetail = (id: string) => {
    setSelectedExecutionId(id);
    setIsDetailModalOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 w-fit">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Completed
          </span>
        );
      case 'WAITING_FOR_APPROVAL':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 w-fit animate-pulse">
            <Clock className="w-3 h-3 text-amber-600" />
            Plan Approval Gate
          </span>
        );
      case 'FAILED':
      case 'BLOCKED':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 flex items-center gap-1 w-fit">
            <XCircle className="w-3 h-3 text-red-600" />
            {status}
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 w-fit">
            <Spinner size="sm" />
            {status}
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-copper-600 text-white shadow-xs">
              <Bot className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-text-primary tracking-tight">
              AI Development Engine &bull; Control Center
            </h1>
          </div>
          <p className="text-xs text-text-muted">
            Autonomous software engineering agent orchestrating code analysis, isolated patch implementation, test verification, and GitHub Pull Requests.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Sparkles className="w-4 h-4" />}
            onClick={() => setIsTriggerModalOpen(true)}
          >
            Launch AI on Task
          </Button>
        </div>
      </div>

      {isLoadingStats && !stats ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Spinner size="lg" />
          <span className="text-xs text-text-muted font-mono">Connecting to AI Orchestrator...</span>
        </div>
      ) : (
        <>
          {/* Key Metric Counters */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="p-4 rounded-lg bg-white border border-border shadow-xs flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">
                Active Executions
              </span>
              <span className="text-2xl font-bold text-blue-600">
                {stats?.active_count || 0}
              </span>
            </div>

            <div className="p-4 rounded-lg bg-white border border-border shadow-xs flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">
                Queued
              </span>
              <span className="text-2xl font-bold text-slate-700">
                {stats?.queued_count || 0}
              </span>
            </div>

            <div className="p-4 rounded-lg bg-white border border-border shadow-xs flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">
                Human Review Gate
              </span>
              <span className={`text-2xl font-bold ${stats?.awaiting_approval_count ? 'text-amber-600 animate-pulse' : 'text-slate-400'}`}>
                {stats?.awaiting_approval_count || 0}
              </span>
            </div>

            <div className="p-4 rounded-lg bg-white border border-border shadow-xs flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">
                Completed
              </span>
              <span className="text-2xl font-bold text-emerald-600">
                {stats?.completed_count || 0}
              </span>
            </div>

            <div className="p-4 rounded-lg bg-white border border-border shadow-xs flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">
                Total Tokens
              </span>
              <span className="text-lg font-bold font-mono text-text-primary">
                {stats?.total_tokens_used?.toLocaleString() || 0}
              </span>
            </div>

            <div className="p-4 rounded-lg bg-white border border-border shadow-xs flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">
                AI Budget Spent
              </span>
              <span className="text-lg font-bold font-mono text-copper-700">
                ${stats?.total_cost_usd?.toFixed(4) || '0.0000'}
              </span>
            </div>
          </div>

          {/* AI Subsystem Configuration & Status Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-white border border-border shadow-xs flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-copper-600" />
                <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                  Provider &amp; Routing
                </h3>
              </div>
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="text-text-muted">Status:</span>
                  <span className="font-semibold text-emerald-700">{stats?.provider_status}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="text-text-muted">Primary Reasoning:</span>
                  <span className="font-mono text-slate-800">{stats?.active_model}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-text-muted">Fast Classifier:</span>
                  <span className="font-mono text-slate-800">{config?.fast_model || 'gemini-1.5-flash'}</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-white border border-border shadow-xs flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                  GitHub Integration
                </h3>
              </div>
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="text-text-muted">Target Repo:</span>
                  <span className="font-mono font-semibold text-slate-800">{stats?.github_repo}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="text-text-muted">Base Branch:</span>
                  <span className="font-mono text-slate-800">{config?.github_base_branch || 'main'}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-text-muted">Pull Request Pipeline:</span>
                  <span className="font-semibold text-emerald-700">Active</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-white border border-border shadow-xs flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                  Autonomy Safeguards
                </h3>
              </div>
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="text-text-muted">Default Policy:</span>
                  <span className="font-semibold text-slate-800">Level 2 (Approved Tasks)</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="text-text-muted">Direct Main Push:</span>
                  <span className="font-semibold text-red-600">Blocked (PR Only)</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-text-muted">Production Deploy:</span>
                  <span className="font-semibold text-amber-700">Human Approval Required</span>
                </div>
              </div>
            </div>
          </div>

          {/* Active & Recent Executions Table */}
          <div className="bg-white border border-border rounded-lg shadow-xs p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-copper-600" />
                <h2 className="text-sm font-bold text-text-primary">
                  AI Task Execution History &bull; Real-Time Pipeline
                </h2>
              </div>
              <span className="text-xs text-text-muted font-mono">
                Auto-refreshing every 5s
              </span>
            </div>

            {(!stats?.recent_executions || stats.recent_executions.length === 0) ? (
              <div className="py-12 text-center text-xs text-text-muted flex flex-col items-center gap-2">
                <Bot className="w-8 h-8 text-slate-300" />
                <p>No AI executions recorded yet.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsTriggerModalOpen(true)}
                >
                  Launch First AI Execution
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-[11px] uppercase tracking-wider text-text-muted font-semibold bg-slate-50">
                      <th className="py-2.5 px-3">Task</th>
                      <th className="py-2.5 px-3">Project</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Stage</th>
                      <th className="py-2.5 px-3">Branch &amp; PR</th>
                      <th className="py-2.5 px-3">Tokens / Cost</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.recent_executions.map((exec) => (
                      <tr key={exec.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3 font-medium text-text-primary">
                          <div className="flex flex-col">
                            <span className="font-semibold">
                              #{exec.task_number ? `ENG-${String(exec.task_number).padStart(3, '0')}` : ''} {exec.task_title}
                            </span>
                            <span className="text-[10px] text-text-muted font-mono">
                              {new Date(exec.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-text-secondary">
                          {exec.project_name || 'PMS'}
                        </td>

                        <td className="py-3 px-3">
                          {getStatusBadge(exec.status)}
                        </td>

                        <td className="py-3 px-3 font-mono text-[11px] text-slate-700">
                          {exec.current_stage}
                        </td>

                        <td className="py-3 px-3">
                          {exec.github_pr_url ? (
                            <a
                              href={exec.github_pr_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-semibold text-[11px]"
                            >
                              <GitPullRequest className="w-3.5 h-3.5" />
                              <span>PR #{exec.github_pr_number || ''}</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : exec.git_branch ? (
                            <span className="inline-flex items-center gap-1 text-slate-600 font-mono text-[11px]">
                              <GitBranch className="w-3 h-3 text-slate-400" />
                              <span className="truncate max-w-[120px]">{exec.git_branch}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">Initializing</span>
                          )}
                        </td>

                        <td className="py-3 px-3 font-mono text-text-muted">
                          <div>{exec.tokens_used.toLocaleString()} tok</div>
                          <div className="text-[10px] text-slate-400">${exec.estimated_cost_usd.toFixed(4)}</div>
                        </td>

                        <td className="py-3 px-3 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenDetail(exec.id)}
                          >
                            View Pipeline
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Execution Detail Modal */}
      <AIExecutionDetailModal
        executionId={selectedExecutionId}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
      />

      {/* Trigger AI on Task Modal */}
      {isTriggerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-border w-full max-w-md p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              <Sparkles className="w-5 h-5 text-copper-600" />
              <h3 className="text-base font-bold text-text-primary">
                Launch Autonomous AI Execution
              </h3>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed">
              Select an approved task. The AI Orchestrator will analyze the code, formulate an implementation plan, create a task branch, and run verification tests.
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-primary">
                Select Task:
              </label>
              <select
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="w-full text-xs p-2.5 rounded border border-border bg-white text-text-primary font-medium focus:ring-2 focus:ring-copper-500"
              >
                <option value="">-- Choose a Task --</option>
                {tasksData?.items?.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    #ENG-{String(t.task_number).padStart(3, '0')}: {t.title} ({t.status})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-primary">
                Autonomy Level:
              </label>
              <select
                value={selectedAutonomy}
                onChange={(e) => setSelectedAutonomy(Number(e.target.value))}
                className="w-full text-xs p-2.5 rounded border border-border bg-white text-text-primary font-medium focus:ring-2 focus:ring-copper-500"
              >
                <option value={2}>Level 2: Approved Task Automation (Recommended)</option>
                <option value={1}>Level 1: Supervised (Requires Human Approval on Plan)</option>
                <option value={0}>Level 0: Analysis &amp; Planning Only (No Code Changes)</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsTriggerModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!selectedTaskId || launchMutation.isPending}
                isLoading={launchMutation.isPending}
                onClick={() => launchMutation.mutate(selectedTaskId)}
              >
                Start Autonomous Execution
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
