import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { TaskSolveResponse } from '../../types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Send,
  Code2,
  ListOrdered,
  FileCheck2,
  Bot,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface AIAutoSolveModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
  taskTitle: string;
  onCommentPosted?: () => void;
}

export const AIAutoSolveModal: React.FC<AIAutoSolveModalProps> = ({
  isOpen,
  onClose,
  taskId,
  taskTitle,
  onCommentPosted,
}) => {
  const queryClient = useQueryClient();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-1.5-pro');
  const [solution, setSolution] = useState<TaskSolveResponse | null>(null);

  const solveMutation = useMutation({
    mutationFn: ({ autoPost }: { autoPost: boolean }) =>
      api.ai.solveTask(taskId, autoPost, customPrompt || undefined, selectedModel),
    onSuccess: (data) => {
      setSolution(data);
      if (data.comment_posted) {
        queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] });
        if (onCommentPosted) onCommentPosted();
        toast.success('AI technical resolution posted directly to task comments!');
      } else {
        toast.success('AI technical resolution synthesized!');
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to generate AI solution');
    },
  });

  const handleCopyCode = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    toast.success('Code copied to clipboard');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyAll = () => {
    if (!solution) return;
    navigator.clipboard.writeText(solution.formatted_markdown);
    setCopiedAll(true);
    toast.success('Full resolution markdown copied');
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handlePostToComments = async () => {
    if (!solution) return;
    try {
      await api.tasks.addComment(taskId, solution.formatted_markdown);
      queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] });
      if (onCommentPosted) onCommentPosted();
      toast.success('AI resolution posted to task comments!');
      onClose();
    } catch {
      toast.error('Failed to post comment');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="AI Bug & Task Resolution Engine"
      size="xl"
    >
      <div className="flex flex-col gap-5 text-xs text-text-primary">
        {/* Header summary badge */}
        <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 truncate">
            <div className="p-2 rounded-lg bg-amber-500 text-white shrink-0 shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="truncate">
              <span className="font-semibold text-amber-950 block truncate text-xs">
                {taskTitle}
              </span>
              <span className="text-[10px] text-amber-800 font-mono">
                Powered by Google Gemini Generative AI &amp; Engineering PMS Diagnostics
              </span>
            </div>
          </div>
          {!solution && !solveMutation.isPending && (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Sparkles className="w-3.5 h-3.5" />}
              onClick={() => solveMutation.mutate({ autoPost: false })}
            >
              Analyze &amp; Resolve
            </Button>
          )}
        </div>

        {/* Custom instruction prompt input & model selector */}
        {!solution && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-purple-600" />
                  Gemini Model Engine
                </span>
                <span className="text-[10px] font-mono text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                  Gemini Advanced Active
                </span>
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-purple-300 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-purple-50/20 font-medium"
              >
                <option value="gemini-1.5-pro">✨ Gemini 1.5 Pro (Advanced - Web Dev &amp; Code Synthesis)</option>
                <option value="gemini-2.0-flash">⚡ Gemini 2.0 Flash (Next-Gen Ultra Fast)</option>
                <option value="gemini-1.5-flash">🚀 Gemini 1.5 Flash (Lightweight Fast)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                Optional Technical Focus / Hints:
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 text-xs rounded-lg border border-border focus:border-amber-500 focus:ring-1 focus:ring-amber-500 bg-white"
                placeholder="e.g. Focus on Nginx gzip, React Query cache, or Altium SPI bus pinout..."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Loading State */}
        {solveMutation.isPending && (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <Spinner size="lg" />
            <div className="text-center">
              <span className="font-semibold text-text-primary text-xs block">
                Synthesizing Technical Resolution...
              </span>
              <span className="text-[11px] text-text-muted">
                Analyzing root cause, circuit/code logic, and formulating patch
              </span>
            </div>
          </div>
        )}

        {/* Initial Prompt state if not yet triggered */}
        {!solution && !solveMutation.isPending && (
          <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50 flex flex-col items-center gap-3">
            <Bot className="w-10 h-10 text-slate-400" />
            <div className="max-w-md">
              <h4 className="font-bold text-slate-800 text-xs mb-1">
                Automated Bug Resolution &amp; Architecture Diagnosis
              </h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Click "Analyze &amp; Resolve" to inspect this task's description, logs, and project architecture.
                AI will identify the root cause, output step-by-step code/schematic fixes, and generate testing checklists.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="primary"
                size="md"
                leftIcon={<Sparkles className="w-4 h-4" />}
                onClick={() => solveMutation.mutate({ autoPost: false })}
              >
                Start AI Diagnosis
              </Button>
              <Button
                variant="secondary"
                size="md"
                leftIcon={<Send className="w-4 h-4 text-emerald-600" />}
                onClick={() => solveMutation.mutate({ autoPost: true })}
              >
                Diagnose &amp; Auto-Post to Task
              </Button>
            </div>
          </div>
        )}

        {/* Solution View */}
        {solution && (
          <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1">
            {/* Classification & Provider badge */}
            <div className="flex items-center justify-between text-[11px] text-text-muted pb-2 border-b border-border">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Issue Classification: <strong className="text-text-primary uppercase">{solution.issue_type}</strong>
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                Engine: {solution.ai_provider}
              </span>
            </div>

            {/* Root Cause Card */}
            <div className="p-3.5 rounded-lg bg-red-50/70 border border-red-200 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-red-800 font-bold text-xs uppercase tracking-wide">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>Root Cause Analysis</span>
              </div>
              <p className="text-xs text-red-950 leading-relaxed whitespace-pre-wrap">
                {solution.root_cause}
              </p>
            </div>

            {/* Solution Summary */}
            <div className="p-3.5 rounded-lg bg-emerald-50/70 border border-emerald-200 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs uppercase tracking-wide">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Recommended Resolution</span>
              </div>
              <p className="text-xs text-emerald-950 leading-relaxed whitespace-pre-wrap">
                {solution.solution_summary}
              </p>
            </div>

            {/* Action Plan */}
            {solution.action_plan && solution.action_plan.length > 0 && (
              <div className="p-4 rounded-lg bg-white border border-border shadow-2xs flex flex-col gap-2">
                <span className="font-bold text-xs text-text-primary flex items-center gap-1.5 uppercase tracking-wide">
                  <ListOrdered className="w-3.5 h-3.5 text-copper-600" />
                  Implementation Action Plan
                </span>
                <ol className="list-decimal pl-5 space-y-1.5 text-xs text-text-secondary leading-relaxed">
                  {solution.action_plan.map((step, idx) => (
                    <li key={idx} className="pl-1">
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Code / Configuration Fixes */}
            {solution.code_fixes && solution.code_fixes.length > 0 && (
              <div className="flex flex-col gap-3">
                <span className="font-bold text-xs text-text-primary flex items-center gap-1.5 uppercase tracking-wide">
                  <Code2 className="w-3.5 h-3.5 text-copper-600" />
                  Code / Configuration Patches ({solution.code_fixes.length})
                </span>
                {solution.code_fixes.map((cf, idx) => (
                  <div key={idx} className="rounded-lg border border-slate-700 bg-slate-900 overflow-hidden shadow-xs">
                    <div className="px-3.5 py-2 bg-slate-800 border-b border-slate-700 flex items-center justify-between text-slate-200">
                      <div className="flex items-center gap-2 truncate">
                        {cf.file_path && (
                          <span className="font-mono text-[11px] text-amber-400 font-semibold truncate">
                            {cf.file_path}
                          </span>
                        )}
                        <span className="text-[11px] text-slate-300 truncate">
                          &bull; {cf.description}
                        </span>
                      </div>
                      <button
                        onClick={() => handleCopyCode(cf.code_snippet, idx)}
                        className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-[10px] font-medium flex items-center gap-1 text-slate-200 transition-colors cursor-pointer"
                        title="Copy code"
                      >
                        {copiedIndex === idx ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedIndex === idx ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <pre className="p-3 text-[11px] font-mono text-emerald-300 overflow-x-auto leading-relaxed">
                      <code>{cf.code_snippet}</code>
                    </pre>
                  </div>
                ))}
              </div>
            )}

            {/* Testing Steps */}
            {solution.testing_steps && solution.testing_steps.length > 0 && (
              <div className="p-4 rounded-lg bg-slate-50 border border-border flex flex-col gap-2">
                <span className="font-bold text-xs text-text-primary flex items-center gap-1.5 uppercase tracking-wide">
                  <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
                  Verification &amp; Testing Checklist
                </span>
                <div className="flex flex-col gap-1.5">
                  {solution.testing_steps.map((step, idx) => (
                    <label key={idx} className="flex items-start gap-2 text-xs text-text-secondary cursor-pointer">
                      <input type="checkbox" className="mt-0.5 rounded border-slate-300 text-copper-600" />
                      <span>{step}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-3 border-t border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {solution && (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                onClick={handleCopyAll}
              >
                {copiedAll ? 'Markdown Copied' : 'Copy Full Markdown'}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {solution && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Send className="w-3.5 h-3.5" />}
                onClick={handlePostToComments}
              >
                Post Fix to Task Comments
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
