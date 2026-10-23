import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Project, Task, TaskSolveResponse, ProjectCopilotResponse } from '../types';
import {
  Sparkles,
  Bug,
  Cpu,
  Send,
  CheckCircle2,
  FileCode,
  Copy,
  Check,
  MessageSquare,
  Wrench,
  ChevronRight,
  FolderOpen,
  ArrowRight,
  Bot,
  Zap,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Textarea';
import { Spinner } from '../components/ui/Spinner';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

export const AICopilotPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'bug_resolver' | 'project_advisor'>('bug_resolver');

  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-1.5-pro');
  const [customInstruction, setCustomInstruction] = useState<string>('');

  const [advisorCategory, setAdvisorCategory] = useState<string>('GENERAL');
  const [advisorProblem, setAdvisorProblem] = useState<string>('');

  const [bugSolution, setBugSolution] = useState<TaskSolveResponse | null>(null);
  const [advisorSolution, setAdvisorSolution] = useState<ProjectCopilotResponse | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const { data: projectsData, isLoading: isLoadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects.getProjects(),
  });

  const projects: Project[] = Array.isArray(projectsData)
    ? projectsData
    : (projectsData as any)?.items || [];

  React.useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      const pms = projects.find((p) => p.name.trim().toLowerCase() === 'pms');
      setSelectedProjectId(pms ? pms.id : projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const { data: tasksData, isLoading: isLoadingTasks } = useQuery({
    queryKey: ['tasks', { project_id: selectedProjectId }],
    queryFn: () => api.tasks.getTasks({ project_id: selectedProjectId }),
    enabled: !!selectedProjectId,
  });

  const tasks: Task[] = Array.isArray(tasksData)
    ? tasksData
    : (tasksData as any)?.items || [];

  React.useEffect(() => {
    if (tasks.length > 0 && !selectedTaskId) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [tasks, selectedTaskId]);

  const { data: aiConfig } = useQuery({
    queryKey: ['ai-config'],
    queryFn: () => api.ai.getConfig(),
  });

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

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-150">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 p-8 text-white shadow-lg">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-amber-200" />
              <span>Google Cloud Generative AI &bull; Gemini Advanced (1.5 Pro)</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Engineering AI Copilot &amp; Bug Auto-Resolver
            </h1>
            <p className="text-sm text-amber-100 max-w-2xl leading-relaxed">
              Automated diagnostics and patch synthesis for reported bugs, hardware roadblocks, circuit calculations, and technical tasks.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {selectedProjectId && (
              <Link
                to={`/projects/${selectedProjectId}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold border border-white/20 transition-all backdrop-blur-md"
              >
                <FolderOpen className="w-4 h-4" />
                Open File Vault
              </Link>
            )}
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-amber-400/20 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-white rounded-t-lg px-6 pt-3 shadow-2xs">
        <button
          onClick={() => setActiveTab('bug_resolver')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'bug_resolver'
              ? 'border-amber-600 text-amber-600 bg-amber-50/30'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          <Bug className="w-4 h-4" />
          Task &amp; Bug Auto-Resolver
        </button>
        <button
          onClick={() => setActiveTab('project_advisor')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'project_advisor'
              ? 'border-amber-600 text-amber-600 bg-amber-50/30'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          <Cpu className="w-4 h-4" />
          Project &amp; Circuit Roadblock Solver
        </button>
      </div>

      {/* Content */}
      <div className="bg-white rounded-b-lg border border-border p-6 shadow-xs space-y-6">
        {activeTab === 'bug_resolver' ? (
          /* TAB 1: BUG AUTO-RESOLVER */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Form & Task Selection */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-600" />
                Select Bug to Auto-Resolve
              </h3>

              <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-border">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">
                    Project
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
                    Select Reported Bug / Task ({tasks.length})
                  </label>
                  <select
                    value={selectedTaskId}
                    onChange={(e) => {
                      setSelectedTaskId(e.target.value);
                      setBugSolution(null);
                    }}
                    disabled={isLoadingTasks || tasks.length === 0}
                    className="w-full text-xs rounded-md border border-border bg-white px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.task_number ? `#${t.task_number} ` : ''}
                        {t.title} [{t.status}]
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      Gemini Model Architecture
                    </span>
                    <span className="text-[10px] font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                      Gemini Advanced (1.5 Pro)
                    </span>
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full text-xs rounded-md border border-purple-300 bg-purple-50/20 px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium"
                  >
                    <option value="gemini-1.5-pro">✨ Gemini 1.5 Pro (Advanced - Deep Web Dev &amp; Patch Synthesis)</option>
                    <option value="gemini-2.0-flash">⚡ Gemini 2.0 Flash (Next-Gen Ultra Fast)</option>
                    <option value="gemini-1.5-flash">🚀 Gemini 1.5 Flash (Lightweight Fast)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">
                    Custom Prompt / Context (Optional)
                  </label>
                  <input
                    type="text"
                    value={customInstruction}
                    onChange={(e) => setCustomInstruction(e.target.value)}
                    placeholder="e.g. Focus on database query caching..."
                    className="w-full text-xs rounded-md border border-border bg-white px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                {selectedTask && (
                  <div className="pt-2 border-t border-border/60 text-xs text-text-secondary space-y-1">
                    <p className="font-semibold text-text-primary">{selectedTask.title}</p>
                    <p className="text-[11px] text-text-muted line-clamp-3">
                      {selectedTask.description || 'No description provided.'}
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-2">
                  <Button
                    variant="primary"
                    className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-xs"
                    leftIcon={solveMutation.isPending ? <Spinner size="sm" /> : <Sparkles className="w-4 h-4" />}
                    disabled={!selectedTaskId || solveMutation.isPending}
                    onClick={() =>
                      solveMutation.mutate({
                        taskId: selectedTaskId,
                        autoPost: false,
                        instruction: customInstruction,
                      })
                    }
                  >
                    {solveMutation.isPending ? 'Analyzing with AI...' : '⚡ Solve with Gemini AI'}
                  </Button>

                  <Button
                    variant="secondary"
                    className="w-full border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100"
                    leftIcon={<MessageSquare className="w-4 h-4 text-amber-700" />}
                    disabled={!selectedTaskId || solveMutation.isPending}
                    onClick={() =>
                      solveMutation.mutate({
                        taskId: selectedTaskId,
                        autoPost: true,
                        instruction: customInstruction,
                      })
                    }
                  >
                    Solve &amp; Auto-Post to Task Discussion
                  </Button>
                </div>
              </div>
            </div>

            {/* Right Column: AI Resolution Details */}
            <div className="lg:col-span-2 space-y-4">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                AI Diagnostic &amp; Resolution Workspace
              </h3>

              {!bugSolution && !solveMutation.isPending && (
                <div className="border-2 border-dashed border-border rounded-xl p-12 text-center flex flex-col items-center justify-center gap-3 bg-slate-50/50">
                  <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                    <Bot className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-text-primary">Ready to Resolve Task</h4>
                    <p className="text-xs text-text-muted mt-1 max-w-md">
                      Select a bug or task from project "{selectedProject?.name || 'PMS'}" and click "Solve with Gemini AI" to generate root cause analysis, action steps, and code patches.
                    </p>
                  </div>
                </div>
              )}

              {solveMutation.isPending && (
                <div className="border border-amber-200 bg-amber-50/30 rounded-xl p-12 text-center flex flex-col items-center justify-center gap-3">
                  <Spinner size="lg" />
                  <p className="text-xs font-medium text-amber-900">
                    Consulting Google Gemini Generative AI... Diagnosing root causes &amp; synthesizing fixes...
                  </p>
                </div>
              )}

              {bugSolution && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  {/* Root Cause Card */}
                  <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        Root Cause Diagnosis
                      </span>
                      <span className="text-[11px] font-mono px-2.5 py-0.5 rounded bg-white text-text-muted border border-amber-200">
                        {bugSolution.issue_type}
                      </span>
                    </div>
                    <p className="text-xs text-text-primary leading-relaxed font-sans">
                      {bugSolution.root_cause}
                    </p>
                  </div>

                  {/* Step by Step Action Plan */}
                  {bugSolution.action_plan && bugSolution.action_plan.length > 0 && (
                    <div className="bg-white border border-border rounded-lg p-5 space-y-3">
                      <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-amber-600" />
                        Step-by-Step Resolution Plan
                      </h4>
                      <ol className="list-decimal list-inside text-xs text-text-secondary space-y-1.5 pl-1">
                        {bugSolution.action_plan.map((step, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Code Patches */}
                  {bugSolution.code_patches && bugSolution.code_patches.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
                        <FileCode className="w-4 h-4 text-blue-600" />
                        Proposed Code &amp; Configuration Diffs
                      </h4>
                      {bugSolution.code_patches.map((patch, idx) => (
                        <div key={idx} className="border border-border rounded-lg overflow-hidden shadow-2xs">
                          <div className="bg-slate-800 text-slate-200 px-4 py-2 text-xs font-mono flex items-center justify-between">
                            <span>{patch.file_path || 'Patch'}</span>
                            <button
                              onClick={() => handleCopy(patch.diff, idx)}
                              className="text-slate-400 hover:text-white flex items-center gap-1.5 text-xs transition-colors"
                            >
                              {copiedIndex === idx ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" /> Copy Patch
                                </>
                              )}
                            </button>
                          </div>
                          <pre className="p-4 bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto leading-relaxed">
                            {patch.diff}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* TAB 2: PROJECT ROADBLOCK SOLVER */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
                <Cpu className="w-4 h-4 text-amber-600" />
                Describe Your Challenge
              </h3>

              <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-border">
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
                    Domain Category
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

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      Gemini Model Architecture
                    </span>
                    <span className="text-[10px] font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                      Gemini Advanced (1.5 Pro)
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
                    Roadblock / Question
                  </label>
                  <Textarea
                    value={advisorProblem}
                    onChange={(e) => setAdvisorProblem(e.target.value)}
                    placeholder="e.g. 'How do we calculate thermal dissipation for 24V to 3.3V switching regulator under 1.5A load?' or 'Fix database query latency for task boards'..."
                    rows={4}
                    className="text-xs"
                  />
                </div>

                <Button
                  variant="primary"
                  className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-xs"
                  leftIcon={advisorMutation.isPending ? <Spinner size="sm" /> : <Bot className="w-4 h-4" />}
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
            </div>

            <div className="lg:col-span-2 space-y-4">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600" />
                Copilot Analysis &amp; Recommendations
              </h3>

              {!advisorSolution && !advisorMutation.isPending && (
                <div className="border-2 border-dashed border-border rounded-xl p-12 text-center flex flex-col items-center justify-center gap-3 bg-slate-50/50">
                  <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                    <Cpu className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-text-primary">Engineering Copilot Ready</h4>
                    <p className="text-xs text-text-muted mt-1 max-w-md">
                      Enter any hardware, circuit, schematic, or firmware roadblock. The Copilot analyzes your vault files and project tasks to provide solutions.
                    </p>
                  </div>
                </div>
              )}

              {advisorMutation.isPending && (
                <div className="border border-amber-200 bg-amber-50/30 rounded-xl p-12 text-center flex flex-col items-center justify-center gap-3">
                  <Spinner size="lg" />
                  <p className="text-xs font-medium text-amber-900">
                    Analyzing project vault documents &amp; synthesizing engineering design recommendations...
                  </p>
                </div>
              )}

              {advisorSolution && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-5">
                    <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-2">
                      Technical Assessment
                    </h4>
                    <div className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap font-sans">
                      {advisorSolution.analysis}
                    </div>
                  </div>

                  {advisorSolution.recommended_solutions && advisorSolution.recommended_solutions.length > 0 && (
                    <div className="bg-white border border-border rounded-lg p-5 space-y-3">
                      <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                        Actionable Engineering Approaches
                      </h4>
                      <ul className="list-disc list-inside text-xs text-text-secondary space-y-1.5 pl-1">
                        {advisorSolution.recommended_solutions.map((sol, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {sol}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {advisorSolution.circuit_or_code_advice && (
                    <div className="border border-border rounded-lg overflow-hidden shadow-2xs">
                      <div className="bg-slate-800 text-slate-200 px-4 py-2 text-xs font-mono">
                        Hardware / Firmware Reference Specs
                      </div>
                      <pre className="p-4 bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto leading-relaxed">
                        {advisorSolution.circuit_or_code_advice}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AICopilotPage;
