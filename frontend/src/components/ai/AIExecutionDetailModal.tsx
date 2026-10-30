import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AITaskExecution } from '../../types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import {
  Bot,
  CheckCircle2,
  AlertTriangle,
  Clock,
  GitBranch,
  GitPullRequest,
  ShieldCheck,
  Cpu,
  FileCode,
  Terminal,
  Play,
  RotateCcw,
  XCircle,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface AIExecutionDetailModalProps {
  executionId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onExecutionUpdated?: () => void;
}

const STAGES = [
  { id: 'QUEUED', label: 'Queued' },
  { id: 'ANALYSIS', label: 'Analysis' },
  { id: 'PLAN_PENDING', label: 'Planning' },
  { id: 'IMPLEMENTATION', label: 'Implementation' },
  { id: 'VERIFICATION', label: 'Testing' },
  { id: 'GITHUB_PR', label: 'Pull Request' },
  { id: 'COMPLETED', label: 'Completed' },
];

export const AIExecutionDetailModal: React.FC<AIExecutionDetailModalProps> = ({
  executionId,
  isOpen,
  onClose,
  onExecutionUpdated,
}) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'timeline' | 'plan' | 'tests' | 'pr'>('timeline');

  // Poll execution every 3 seconds while active
  const { data: execution, isLoading } = useQuery<AITaskExecution>({
    queryKey: ['ai-execution', executionId],
    queryFn: () => api.aiOrchestrator.getExecution(executionId!),
    enabled: !!executionId && isOpen,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (
        status &&
        ['QUEUED', 'ANALYZING', 'IMPLEMENTING', 'TESTING'].includes(status)
      ) {
        return 3000;
      }
      return false;
    },
  });

  // Approve Plan Mutation
  const approvePlanMutation = useMutation({
    mutationFn: () => api.aiOrchestrator.approvePlan(executionId!, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-execution', executionId] });
      queryClient.invalidateQueries({ queryKey: ['ai-control-center'] });
      toast.success('Implementation Plan Approved! Agent proceeding to code changes.');
      onExecutionUpdated?.();
    },
    onError: () => toast.error('Failed to approve plan'),
  });

  // Cancel Mutation
  const cancelMutation = useMutation({
    mutationFn: () => api.aiOrchestrator.cancelExecution(executionId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-execution', executionId] });
      queryClient.invalidateQueries({ queryKey: ['ai-control-center'] });
      toast.success('AI Execution job cancelled.');
      onExecutionUpdated?.();
    },
    onError: () => toast.error('Failed to cancel execution'),
  });

  // Retry Mutation
  const retryMutation = useMutation({
    mutationFn: () => api.aiOrchestrator.retryExecution(executionId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-execution', executionId] });
      queryClient.invalidateQueries({ queryKey: ['ai-control-center'] });
      toast.success('Execution re-queued for processing.');
      onExecutionUpdated?.();
    },
    onError: () => toast.error('Failed to retry execution'),
  });

  if (!isOpen) return null;

  const statusBadge = (status?: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Verified &amp; Completed
          </span>
        );
      case 'WAITING_FOR_APPROVAL':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1.5 animate-pulse">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Human Approval Gate
          </span>
        );
      case 'FAILED':
      case 'BLOCKED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-red-600" />
            {status}
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1.5">
            <Spinner size="sm" />
            {status || 'Running'}
          </span>
        );
    }
  };

  const currentStageIndex = STAGES.findIndex((s) => s.id === execution?.current_stage);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-copper-600" />
          <span>AI Task Execution: #{execution?.task_number ? `ENG-${String(execution.task_number).padStart(3, '0')}` : ''} {execution?.task_title}</span>
        </div>
      }
      size="xl"
    >
      {isLoading || !execution ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3">
          <Spinner size="lg" />
          <span className="text-xs text-text-muted font-mono">Loading AI execution state...</span>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Top Status & Telemetry Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg bg-slate-50 border border-border">
            <div className="flex items-center gap-3">
              {statusBadge(execution.status)}
              <span className="text-xs text-text-muted">
                Model: <strong className="text-text-primary font-mono">{execution.selected_model}</strong>
              </span>
              <span className="text-xs text-text-muted">
                Autonomy: <strong className="text-text-primary">Level {execution.autonomy_level}</strong>
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="text-text-muted">
                Tokens: <strong className="text-text-primary">{execution.tokens_used.toLocaleString()}</strong>
              </span>
              <span className="text-text-muted">
                Cost: <strong className="text-text-primary">${execution.estimated_cost_usd.toFixed(4)}</strong>
              </span>
              <span className="text-text-muted">
                Time: <strong className="text-text-primary">{execution.duration_seconds}s</strong>
              </span>
            </div>
          </div>

          {/* 7-Stage Visual Pipeline Bar */}
          <div className="flex items-center justify-between gap-1 overflow-x-auto py-2">
            {STAGES.map((st, idx) => {
              const isPast = execution.status === 'COMPLETED' || currentStageIndex > idx;
              const isCurrent = currentStageIndex === idx && execution.status !== 'COMPLETED';
              return (
                <div key={st.id} className="flex items-center gap-1 shrink-0">
                  <div
                    className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 border ${
                      isPast
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : isCurrent
                        ? 'bg-copper-50 text-copper-800 border-copper-300 ring-2 ring-copper-200'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    {isPast ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ) : isCurrent ? (
                      <Spinner size="sm" />
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-full bg-slate-300 text-[9px] text-white flex items-center justify-center font-bold">
                        {idx + 1}
                      </span>
                    )}
                    <span>{st.label}</span>
                  </div>
                  {idx < STAGES.length - 1 && (
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Human Approval Required Gate Banner */}
          {execution.status === 'WAITING_FOR_APPROVAL' && execution.plan && (
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-300 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-amber-900">
                    Human Review Gate: Implementation Plan Approval Required
                  </h4>
                  <p className="text-xs text-amber-700 mt-0.5">
                    The Planning Agent has formulated the technical approach. Please review the plan below and approve before code modifications begin.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<CheckCircle2 className="w-4 h-4" />}
                  isLoading={approvePlanMutation.isPending}
                  onClick={() => approvePlanMutation.mutate()}
                >
                  Approve Plan &amp; Proceed
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cancelMutation.mutate()}
                >
                  Reject &amp; Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Failure Alert Banner */}
          {execution.status === 'FAILED' && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-red-900">
                    AI Execution Failed
                  </h4>
                  <p className="text-xs text-red-700 mt-0.5 font-mono">
                    {execution.error_message || 'An error occurred during agent execution. You can retry the pipeline now.'}
                  </p>
                </div>
              </div>
              <Button
                variant="danger"
                size="sm"
                leftIcon={<RotateCcw className="w-4 h-4" />}
                isLoading={retryMutation.isPending}
                onClick={() => retryMutation.mutate()}
              >
                Retry Execution
              </Button>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-border pb-1">
            <button
              onClick={() => setActiveTab('timeline')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-t border-b-2 transition-colors ${
                activeTab === 'timeline'
                  ? 'border-copper-600 text-copper-800 bg-copper-50/50'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              Execution Timeline ({execution.steps?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('plan')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-t border-b-2 transition-colors ${
                activeTab === 'plan'
                  ? 'border-copper-600 text-copper-800 bg-copper-50/50'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              Implementation Plan
            </button>
            <button
              onClick={() => setActiveTab('pr')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-t border-b-2 transition-colors ${
                activeTab === 'pr'
                  ? 'border-copper-600 text-copper-800 bg-copper-50/50'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              GitHub PR &amp; Branch
            </button>
          </div>

          {/* Tab 1: Execution Step Timeline */}
          {activeTab === 'timeline' && (
            <div className="flex flex-col gap-3 max-h-[380px] overflow-y-auto pr-1">
              {(!execution.steps || execution.steps.length === 0) ? (
                <div className="py-8 text-center text-xs text-text-muted">
                  No steps recorded yet. Agent is initializing...
                </div>
              ) : (
                execution.steps.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 rounded-lg border border-border bg-white shadow-xs flex items-start gap-3"
                  >
                    <div className="p-1.5 rounded bg-slate-100 text-slate-700 shrink-0 mt-0.5">
                      {s.status === 'COMPLETED' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : s.status === 'FAILED' ? (
                        <XCircle className="w-4 h-4 text-red-600" />
                      ) : (
                        <Spinner size="sm" />
                      )}
                    </div>
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-text-primary">
                          {s.step_index}. {s.title}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                            {s.agent_role}
                          </span>
                          <span className="text-[10px] font-mono text-text-muted">
                            {s.duration_seconds}s
                          </span>
                        </div>
                      </div>
                      {s.summary && (
                        <p className="text-xs text-text-secondary leading-relaxed">
                          {s.summary}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 2: Implementation Plan */}
          {activeTab === 'plan' && (
            <div className="flex flex-col gap-4 max-h-[380px] overflow-y-auto pr-1">
              {!execution.plan ? (
                <div className="py-8 text-center text-xs text-text-muted">
                  Planning Agent has not formulated the plan yet.
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="p-4 rounded-lg bg-slate-50 border border-border flex flex-col gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                      Problem Statement
                    </span>
                    <p className="text-xs text-text-primary leading-relaxed font-mono bg-white p-2.5 rounded border border-border">
                      {execution.plan.problem_statement}
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50 border border-border flex flex-col gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                      Affected Repository Files
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {execution.plan.affected_files?.map((f, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 rounded bg-white text-xs font-mono font-semibold border border-slate-200 text-slate-800 flex items-center gap-1"
                        >
                          <FileCode className="w-3.5 h-3.5 text-copper-600" />
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50 border border-border flex flex-col gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                      Execution Steps
                    </span>
                    <div className="flex flex-col gap-2">
                      {execution.plan.planned_steps?.map((stepObj: any, i: number) => (
                        <div
                          key={i}
                          className="p-2.5 rounded bg-white border border-border text-xs flex items-center justify-between"
                        >
                          <span className="text-text-primary font-medium">
                            {i + 1}. {stepObj.description || stepObj.step}
                          </span>
                          {stepObj.expected_action && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-copper-50 text-copper-700 font-semibold border border-copper-200">
                              {stepObj.expected_action}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: GitHub PR & Branch */}
          {activeTab === 'pr' && (
            <div className="flex flex-col gap-4">
              <div className="p-4 rounded-lg bg-slate-50 border border-border flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-copper-600" />
                    <span className="text-xs font-bold text-text-primary">Task Branch</span>
                  </div>
                  <span className="font-mono text-xs px-2.5 py-1 rounded bg-white border border-border font-semibold text-text-primary">
                    {execution.git_branch || 'ai/task-initializing...'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GitPullRequest className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-text-primary">Pull Request</span>
                  </div>
                  {execution.github_pr_url ? (
                    <a
                      href={execution.github_pr_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
                    >
                      <span>Open PR #{execution.github_pr_number || ''}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ) : (
                    <span className="text-xs text-text-muted italic font-mono">
                      {execution.status === 'COMPLETED' ? 'Branch pushed (PR generated)' : 'PR generated upon completion'}
                    </span>
                  )}
                </div>

                {execution.git_head_commit && (
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200">
                    <span className="text-text-muted">Latest Commit SHA:</span>
                    <span className="font-mono text-slate-800">{execution.git_head_commit}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bottom Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <span className="text-[11px] text-text-muted">
              Execution ID: <code className="font-mono">{execution.id}</code>
            </span>
            <div className="flex items-center gap-2">
              {['FAILED', 'CANCELLED', 'BLOCKED'].includes(execution.status) && (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<RotateCcw className="w-4 h-4 text-copper-600" />}
                  isLoading={retryMutation.isPending}
                  onClick={() => retryMutation.mutate()}
                >
                  Retry Execution
                </Button>
              )}
              {['QUEUED', 'ANALYZING', 'IMPLEMENTING', 'TESTING'].includes(execution.status) && (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<XCircle className="w-4 h-4 text-red-600" />}
                  isLoading={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate()}
                >
                  Cancel Execution
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
