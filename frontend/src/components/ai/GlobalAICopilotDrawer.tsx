import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Project, Task, TaskSolveResponse, ProjectCopilotResponse } from '../../types';
import {
  Sparkles,
  X,
  Bot,
  Bug,
  Cpu,
  Layers,
  Send,
  CheckCircle2,
  FileCode,
  AlertCircle,
  Copy,
  Check,
  MessageSquare,
  Wrench,
  ChevronRight,
  RefreshCw,
  FolderOpen,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { Select } from '../ui/Select';
import { Spinner } from '../ui/Spinner';
import toast from 'react-hot-toast';

export interface GlobalAICopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialProjectId?: string;
  initialTaskId?: string;
}

export const GlobalAICopilotDrawer: React.FC<GlobalAICopilotDrawerProps> = ({
  isOpen,
  onClose,
  initialProjectId,
  initialTaskId,
}) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'bug_resolver' | 'project_advisor'>('bug_resolver');

  // Selected state
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId || '');
  const [selectedTaskId, setSelectedTaskId] = useState<string>(initialTaskId || '');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-1.5-pro');
  const [customInstruction, setCustomInstruction] = useState<string>('');

  // Project Advisor state
  const [advisorCategory, setAdvisorCategory] = useState<string>('GENERAL');
  const [advisorProblem, setAdvisorProblem] = useState<string>('');

  // Results
  const [bugSolution, setBugSolution] = useState<TaskSolveResponse | null>(null);
  const [advisorSolution, setAdvisorSolution] = useState<ProjectCopilotResponse | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Queries
  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects.getProjects(),
    enabled: isOpen,
  });

  const projects: Project[] = Array.isArray(projectsData)
    ? projectsData
    : (projectsData as any)?.items || [];

  // Default to first project (or PMS) if none selected
  React.useEffect(() => {
    if (isOpen && !selectedProjectId && projects.length > 0) {
      const pms = projects.find((p) => p.name.trim().toLowerCase() === 'pms');
      setSelectedProjectId(pms ? pms.id : projects[0].id);
    }
  }, [isOpen, projects, selectedProjectId]);

  // Tasks for selected project
  const { data: tasksData, isLoading: isLoadingTasks } = useQuery({
    queryKey: ['tasks', { project_id: selectedProjectId }],
    queryFn: () => api.tasks.getTasks({ project_id: selectedProjectId }),
    enabled: isOpen && !!selectedProjectId,
  });

  const tasks: Task[] = Array.isArray(tasksData)
    ? tasksData
    : (tasksData as any)?.items || [];

  // Set initial task if available
  React.useEffect(() => {
    if (tasks.length > 0 && !selectedTaskId) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [tasks, selectedTaskId]);

  // AI Mutations
  const solveMutation = useMutation({
    mutationFn: async ({
      taskId,
      autoPost,
      instruction,
      model,
    }: {
      taskId: string;
      autoPost: boolean;
      instruction?: string;
      model?: string;
    }) => {
      return api.ai.solveTask(taskId, autoPost, instruction, model || selectedModel);
    },
    onSuccess: (data) => {
      setBugSolution(data);
      if (data.comment_posted) {
        toast.success('AI technical analysis auto-posted to task discussion!');
        queryClient.invalidateQueries({ queryKey: ['task-comments'] });
      } else {
        toast.success('AI solution synthesized successfully!');
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to generate AI solution.');
    },
  });

  const advisorMutation = useMutation({
    mutationFn: async ({
      projectId,
      problem,
      category,
      model,
    }: {
      projectId: string;
      problem: string;
      category: string;
      model?: string;
    }) => {
      return api.ai.consultProjectCopilot(projectId, problem, category, model || selectedModel);
    },
    onSuccess: (data) => {
      setAdvisorSolution(data);
      toast.success('AI Engineering Copilot formulated solutions!');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to consult Engineering Copilot.');
    },
  });

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col border-l border-border animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-amber-600 to-orange-500 flex items-center justify-center text-white shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-text-primary">
                  Engineering AI Copilot
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-purple-100 text-purple-900 rounded-full border border-purple-300 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-purple-600" />
                  Gemini 1.5 Pro (Advanced)
                </span>
              </div>
              <p className="text-xs text-text-muted">
                Bug auto-resolver, circuit analyzer &amp; hardware/software advisory
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-slate-100 text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-border bg-slate-50/70 px-6 pt-2">
          <button
            onClick={() => setActiveTab('bug_resolver')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'bug_resolver'
                ? 'border-amber-600 text-amber-600 bg-white rounded-t-md shadow-2xs'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <Bug className="w-3.5 h-3.5" />
            Bug &amp; Task Auto-Resolver
          </button>
          <button
            onClick={() => setActiveTab('project_advisor')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'project_advisor'
                ? 'border-amber-600 text-amber-600 bg-white rounded-t-md shadow-2xs'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            Project &amp; Circuit Copilot
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'bug_resolver' ? (
            /* TAB 1: BUG AUTO-RESOLVER */
            <div className="space-y-5">
              {/* Controls */}
              <div className="bg-slate-50 p-4 rounded-lg border border-border space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                      Target Project
                    </label>
                    <select
                      value={selectedProjectId}
                      onChange={(e) => {
                        setSelectedProjectId(e.target.value);
                        setSelectedTaskId('');
                        setBugSolution(null);
                      }}
                      className="w-full text-xs rounded-md border border-border bg-white px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                      Reported Task / Bug
                    </label>
                    <select
                      value={selectedTaskId}
                      onChange={(e) => {
                        setSelectedTaskId(e.target.value);
                        setBugSolution(null);
                      }}
                      disabled={isLoadingTasks || tasks.length === 0}
                      className="w-full text-xs rounded-md border border-border bg-white px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
                    >
                      {tasks.length === 0 ? (
                        <option value="">No tasks in this project</option>
                      ) : (
                        tasks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.task_number ? `#${t.task_number} ` : ''}
                            {t.title}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-purple-600" />
                      Gemini Model Architecture
                    </span>
                    <span className="text-[10px] font-mono font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                      Recommended: Gemini 1.5 Pro
                    </span>
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full text-xs rounded-md border border-purple-300 bg-purple-50/20 px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium"
                  >
                    <option value="gemini-1.5-pro">✨ Gemini 1.5 Pro (Advanced - Web Dev, Deep Reasoning & Code Synthesis)</option>
                    <option value="gemini-2.0-flash">⚡ Gemini 2.0 Flash (Next-Gen Ultra Fast)</option>
                    <option value="gemini-1.5-flash">🚀 Gemini 1.5 Flash (Lightweight Fast)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">
                    Custom AI Focus / Error Logs (Optional)
                  </label>
                  <input
                    type="text"
                    value={customInstruction}
                    onChange={(e) => setCustomInstruction(e.target.value)}
                    placeholder="e.g. Focus on query optimization or explain circuit voltage drop..."
                    className="w-full text-xs rounded-md border border-border bg-white px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    variant="primary"
                    size="sm"
                    className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-xs"
                    leftIcon={solveMutation.isPending ? <Spinner size="sm" /> : <Sparkles className="w-3.5 h-3.5" />}
                    disabled={!selectedTaskId || solveMutation.isPending}
                    onClick={() =>
                      solveMutation.mutate({
                        taskId: selectedTaskId,
                        autoPost: false,
                        instruction: customInstruction,
                      })
                    }
                  >
                    {solveMutation.isPending ? 'Diagnosing with AI...' : '⚡ Analyze & Synthesize Fix'}
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    className="border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100"
                    leftIcon={<MessageSquare className="w-3.5 h-3.5 text-amber-700" />}
                    disabled={!selectedTaskId || solveMutation.isPending}
                    onClick={() =>
                      solveMutation.mutate({
                        taskId: selectedTaskId,
                        autoPost: true,
                        instruction: customInstruction,
                      })
                    }
                  >
                    Solve &amp; Post Comment
                  </Button>
                </div>
              </div>

              {/* Solution Output */}
              {bugSolution && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  {/* Summary Card */}
                  <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        Root Cause Diagnosis
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white text-text-muted border border-amber-200">
                        Classification: {bugSolution.issue_type}
                      </span>
                    </div>
                    <p className="text-xs text-text-primary leading-relaxed">
                      {bugSolution.root_cause}
                    </p>
                  </div>

                  {/* Action Plan */}
                  {bugSolution.action_plan && bugSolution.action_plan.length > 0 && (
                    <div className="bg-white border border-border rounded-lg p-4 space-y-2">
                      <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-amber-600" />
                        Step-by-Step Resolution Steps
                      </h4>
                      <ol className="list-decimal list-inside text-xs text-text-secondary space-y-1">
                        {bugSolution.action_plan.map((step, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Code / Configuration Patches */}
                  {bugSolution.code_patches && bugSolution.code_patches.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                        <FileCode className="w-3.5 h-3.5 text-blue-600" />
                        Recommended Code Patches &amp; Configs
                      </h4>
                      {bugSolution.code_patches.map((patch, idx) => (
                        <div key={idx} className="border border-border rounded-lg overflow-hidden">
                          <div className="bg-slate-800 text-slate-200 px-3 py-1.5 text-[11px] font-mono flex items-center justify-between">
                            <span>{patch.file_path || 'Patch'}</span>
                            <button
                              onClick={() => handleCopy(patch.diff, idx)}
                              className="text-slate-400 hover:text-white flex items-center gap-1 text-[10px]"
                            >
                              {copiedIndex === idx ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" /> Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" /> Copy
                                </>
                              )}
                            </button>
                          </div>
                          <pre className="p-3 bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto leading-relaxed">
                            {patch.diff}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Full Markdown Summary */}
                  {bugSolution.formatted_markdown && (
                    <details className="bg-slate-50 border border-border rounded-lg p-3 text-xs">
                      <summary className="font-semibold text-text-secondary cursor-pointer hover:text-text-primary">
                        View Complete Technical Report Markdown
                      </summary>
                      <pre className="mt-3 p-3 bg-white rounded border border-border font-mono text-[11px] whitespace-pre-wrap text-text-secondary">
                        {bugSolution.formatted_markdown}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* TAB 2: PROJECT & CIRCUIT COPILOT */
            <div className="space-y-5">
              <div className="bg-slate-50 p-4 rounded-lg border border-border space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                      Project
                    </label>
                    <select
                      value={selectedProjectId}
                      onChange={(e) => {
                        setSelectedProjectId(e.target.value);
                        setAdvisorSolution(null);
                      }}
                      className="w-full text-xs rounded-md border border-border bg-white px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                      Engineering Domain
                    </label>
                    <select
                      value={advisorCategory}
                      onChange={(e) => setAdvisorCategory(e.target.value)}
                      className="w-full text-xs rounded-md border border-border bg-white px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="GENERAL">General Engineering &amp; Architecture</option>
                      <option value="HARDWARE">Hardware &amp; Circuit Design</option>
                      <option value="FIRMWARE">Firmware &amp; Embedded Systems</option>
                      <option value="SCHEMATIC">Schematic &amp; Component Choice</option>
                      <option value="BUG">Software Defect &amp; Database</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-purple-600" />
                      Gemini Model Architecture
                    </span>
                    <span className="text-[10px] font-mono font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                      Gemini 1.5 Pro Active
                    </span>
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full text-xs rounded-md border border-purple-300 bg-purple-50/20 px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium"
                  >
                    <option value="gemini-1.5-pro">✨ Gemini 1.5 Pro (Advanced - Web Dev &amp; Deep Architecture)</option>
                    <option value="gemini-2.0-flash">⚡ Gemini 2.0 Flash (Next-Gen Ultra Fast)</option>
                    <option value="gemini-1.5-flash">🚀 Gemini 1.5 Flash (Lightweight Fast)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">
                    Engineering Challenge / Roadblock
                  </label>
                  <Textarea
                    value={advisorProblem}
                    onChange={(e) => setAdvisorProblem(e.target.value)}
                    placeholder="Describe your design obstacle (e.g. 'I2C pull-up resistor calculation for 400kHz', 'ADC noisy readings during wireless TX', 'Database slow on task lists')..."
                    rows={3}
                    className="text-xs"
                  />
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-xs"
                  leftIcon={advisorMutation.isPending ? <Spinner size="sm" /> : <Bot className="w-3.5 h-3.5" />}
                  disabled={!selectedProjectId || !advisorProblem.trim() || advisorMutation.isPending}
                  onClick={() =>
                    advisorMutation.mutate({
                      projectId: selectedProjectId,
                      problem: advisorProblem,
                      category: advisorCategory,
                    })
                  }
                >
                  {advisorMutation.isPending ? 'Consulting Gemini AI...' : 'Ask Engineering Copilot'}
                </Button>
              </div>

              {/* Advisor Output */}
              {advisorSolution && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-4">
                    <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-2">
                      Technical Solution &amp; Recommendations
                    </h4>
                    <div className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap">
                      {advisorSolution.analysis}
                    </div>
                  </div>

                  {advisorSolution.recommended_solutions && advisorSolution.recommended_solutions.length > 0 && (
                    <div className="bg-white border border-border rounded-lg p-4 space-y-2">
                      <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                        Actionable Engineering Approaches
                      </h4>
                      <ul className="list-disc list-inside text-xs text-text-secondary space-y-1">
                        {advisorSolution.recommended_solutions.map((sol, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {sol}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {advisorSolution.circuit_or_code_advice && (
                    <div className="border border-border rounded-lg overflow-hidden">
                      <div className="bg-slate-800 text-slate-200 px-3 py-1.5 text-[11px] font-mono">
                        Hardware / Firmware Reference Code
                      </div>
                      <pre className="p-3 bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto leading-relaxed">
                        {advisorSolution.circuit_or_code_advice}
                      </pre>
                    </div>
                  )}

                  {advisorSolution.suggested_tasks && advisorSolution.suggested_tasks.length > 0 && (
                    <div className="bg-slate-50 border border-border rounded-lg p-4 space-y-2">
                      <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                        Suggested Follow-Up Tasks
                      </h4>
                      <div className="space-y-1.5">
                        {advisorSolution.suggested_tasks.map((taskName, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 text-xs text-text-primary bg-white p-2 rounded border border-border/80"
                          >
                            <ChevronRight className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>{taskName}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GlobalAICopilotDrawer;
