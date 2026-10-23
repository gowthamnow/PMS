import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Project, Task, TaskSolveResponse, ProjectCopilotResponse } from '../../types';
import {
  Sparkles,
  X,
  Bot,
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
  User,
  Zap,
  Info,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { Spinner } from '../ui/Spinner';
import toast from 'react-hot-toast';

export interface GlobalAICopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialProjectId?: string;
  initialTaskId?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  tokensUsed?: number;
  timestamp: string;
}

export const GlobalAICopilotDrawer: React.FC<GlobalAICopilotDrawerProps> = ({
  isOpen,
  onClose,
  initialProjectId,
  initialTaskId,
}) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState<'chat' | 'bug_resolver' | 'project_advisor'>('chat');

  // Selected scope state
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId || '');
  const [selectedTaskId, setSelectedTaskId] = useState<string>(initialTaskId || '');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-1.5-pro');

  // Chat Tab state
  const [chatInput, setChatInput] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: `Hello! I am your Engineering AI Copilot powered by Google Gemini.\n\nI can help you:\n• Synthesize bug fixes and database query optimizations\n• Provide hardware circuit calculations and firmware advice\n• Answer systems architecture and full-stack PMS questions\n\n${
        isAdmin
          ? '👑 **Administrator Mode:** Unrestricted token budget & comprehensive diagnostics.'
          : '⚡ **Member Low-Token Mode:** Replies are strictly compressed (<250 tokens, 15 queries/day) to save API consumption.'
      }`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Bug Resolver state
  const [customInstruction, setCustomInstruction] = useState<string>('');
  const [bugSolution, setBugSolution] = useState<TaskSolveResponse | null>(null);

  // Project Advisor state
  const [advisorCategory, setAdvisorCategory] = useState<string>('GENERAL');
  const [advisorProblem, setAdvisorProblem] = useState<string>('');
  const [advisorSolution, setAdvisorSolution] = useState<ProjectCopilotResponse | null>(null);

  // Copy tracking
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // AI Configuration & Member Quota Query
  const { data: aiConfig, refetch: refetchConfig } = useQuery({
    queryKey: ['ai-config'],
    queryFn: () => api.ai.getConfig(),
    enabled: isOpen,
    staleTime: 10000,
  });

  const remainingQuota = aiConfig?.user_remaining_quota ?? (isAdmin ? 999 : 15);

  // Projects Query
  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects.getProjects(),
    enabled: isOpen,
  });

  const projects: Project[] = Array.isArray(projectsData)
    ? projectsData
    : (projectsData as any)?.items || [];

  // Default to PMS or first project
  useEffect(() => {
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

  useEffect(() => {
    if (tasks.length > 0 && !selectedTaskId) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [tasks, selectedTaskId]);

  // Scroll to bottom of chat
  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab]);

  // Chat Mutation
  const chatMutation = useMutation({
    mutationFn: async (messageText: string) => {
      return api.ai.chat(messageText, selectedProjectId || undefined, selectedModel);
    },
    onSuccess: (data) => {
      const aiMsg: ChatMessage = {
        id: Date.now().toString(),
        sender: 'ai',
        text: data.reply,
        tokensUsed: data.tokens_used,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages((prev) => [...prev, aiMsg]);
      refetchConfig();
    },
    onError: (err: any) => {
      const errorDetail = err.response?.data?.detail || 'Failed to communicate with AI Copilot.';
      toast.error(errorDetail);
      const errorMsg: ChatMessage = {
        id: Date.now().toString(),
        sender: 'ai',
        text: `⚠️ **Error:** ${errorDetail}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages((prev) => [...prev, errorMsg]);
    },
  });

  // Bug Resolver Mutation
  const solveMutation = useMutation({
    mutationFn: async ({
      taskId,
      autoPost,
      instruction,
    }: {
      taskId: string;
      autoPost: boolean;
      instruction?: string;
    }) => {
      return api.ai.solveTask(taskId, autoPost, instruction, selectedModel);
    },
    onSuccess: (data) => {
      setBugSolution(data);
      refetchConfig();
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

  // Advisor Mutation
  const advisorMutation = useMutation({
    mutationFn: async ({
      projectId,
      problem,
      category,
    }: {
      projectId: string;
      problem: string;
      category: string;
    }) => {
      return api.ai.consultProjectCopilot(projectId, problem, category, selectedModel);
    },
    onSuccess: (data) => {
      setAdvisorSolution(data);
      refetchConfig();
      toast.success('AI Engineering Copilot formulated recommendations!');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to consult Engineering Copilot.');
    },
  });

  const handleSendChat = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || chatMutation.isPending) return;

    if (!isAdmin && trimmed.length > 350) {
      toast('Prompt trimmed to 350 characters to save member token allowance.', { icon: '⚡' });
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    chatMutation.mutate(trimmed);
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Helper to format text with code blocks
  const renderFormattedMarkdown = (content: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('```')) {
        const firstLineEnd = part.indexOf('\n');
        const lang = part.slice(3, firstLineEnd).trim() || 'code';
        const code = part.slice(firstLineEnd + 1, -3);
        return (
          <div
            key={idx}
            className="my-2.5 rounded-lg border border-slate-700 overflow-hidden bg-slate-900 text-slate-100 font-mono text-[11px]"
          >
            <div className="flex items-center justify-between px-3 py-1 bg-slate-800 text-slate-400 text-[10px]">
              <span>{lang}</span>
              <button
                type="button"
                onClick={() => handleCopy(code, idx + 5000)}
                className="hover:text-white flex items-center gap-1 cursor-pointer"
              >
                {copiedIndex === idx + 5000 ? (
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
            <pre className="p-3 overflow-x-auto whitespace-pre leading-relaxed">{code}</pre>
          </div>
        );
      }
      return (
        <span key={idx} className="whitespace-pre-wrap leading-relaxed">
          {part}
        </span>
      );
    });
  };

  const quickPrompts = [
    'How do I optimize database queries in FastAPI?',
    'I2C 400kHz pull-up resistor calculation',
    'Explain decoupling capacitor placement for MCU rails',
    'How to prevent race conditions in React hooks?',
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col border-l border-border animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-border bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-amber-600 to-orange-500 flex items-center justify-center text-white shadow-xs">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-text-primary">
                  Engineering AI Copilot
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-purple-100 text-purple-900 rounded-full border border-purple-300 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-purple-600" />
                  Gemini Advanced
                </span>
              </div>
              <p className="text-xs text-text-muted">
                All-in-one assistant: Instant engineering chat, bug solver &amp; project advisor
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-slate-100 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            title="Close Drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Member Quota & Token Badge Strip */}
        <div className="px-6 py-2 bg-slate-50 border-b border-border flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Admin Mode: Full token capacity (unlimited daily queries)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-300 font-semibold text-[11px]">
                <Zap className="w-3.5 h-3.5 text-amber-600" />
                Member Low-Token Mode: Max 250 tokens/reply &bull; {remainingQuota}/15 daily queries remaining
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="text-[11px] font-mono font-medium rounded border border-purple-300 bg-white px-2 py-1 text-purple-900 focus:outline-none focus:ring-1 focus:ring-purple-500"
            >
              <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
              <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
              <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
            </select>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-border bg-slate-50/70 px-6 pt-2">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'chat'
                ? 'border-amber-600 text-amber-600 bg-white rounded-t-md shadow-2xs'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            Engineering Chat
          </button>
          <button
            onClick={() => setActiveTab('bug_resolver')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
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
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
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
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: INSTANT ENGINEERING CHAT */}
          {activeTab === 'chat' && (
            <div className="flex flex-col h-full space-y-4">
              {/* Optional Project Context Filter */}
              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-border">
                <span className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-amber-600" />
                  Active Project Context:
                </span>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="text-xs rounded border border-border bg-white px-2.5 py-1 text-text-primary focus:outline-none focus:ring-1 focus:ring-amber-500 max-w-[260px] truncate"
                >
                  <option value="">🏢 General Engineering (No Project Context)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Chat Messages Stream */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-[300px]">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.sender === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 text-[11px] text-text-muted">
                      {msg.sender === 'user' ? (
                        <>
                          <span>You</span>
                          <User className="w-3 h-3 text-copper-600" />
                        </>
                      ) : (
                        <>
                          <Bot className="w-3 h-3 text-amber-600" />
                          <span className="font-semibold text-amber-900">Engineering AI</span>
                          {msg.tokensUsed !== undefined && (
                            <span className="text-[10px] font-mono bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.2 rounded">
                              ⚡ ~{msg.tokensUsed} tokens
                            </span>
                          )}
                        </>
                      )}
                      <span>&bull;</span>
                      <span>{msg.timestamp}</span>
                    </div>

                    <div
                      className={`max-w-[90%] rounded-xl p-3.5 text-xs shadow-2xs leading-relaxed ${
                        msg.sender === 'user'
                          ? 'bg-gradient-to-r from-copper-600 to-amber-700 text-white rounded-br-none'
                          : 'bg-slate-50 border border-border text-text-primary rounded-bl-none'
                      }`}
                    >
                      {msg.sender === 'user' ? (
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      ) : (
                        renderFormattedMarkdown(msg.text)
                      )}
                    </div>
                  </div>
                ))}

                {chatMutation.isPending && (
                  <div className="flex items-center gap-2 text-xs text-text-muted bg-amber-50/60 border border-amber-200 p-3 rounded-lg max-w-[80%] animate-pulse">
                    <Spinner size="sm" />
                    <span>AI Copilot formulating solution adhering to token allowance...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Prompts */}
              {chatMessages.length <= 3 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                    Suggested Engineering Prompts:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {quickPrompts.map((prompt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setChatInput(prompt);
                        }}
                        className="text-[11px] px-2.5 py-1 bg-slate-100 hover:bg-amber-50 hover:text-amber-900 border border-border rounded-full text-text-secondary transition-colors cursor-pointer"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Chat Input Bar */}
              <div className="pt-2 border-t border-border">
                <form onSubmit={handleSendChat} className="space-y-2">
                  <div className="relative flex items-center">
                    <Textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendChat();
                        }
                      }}
                      placeholder={
                        isAdmin
                          ? 'Ask anything (code diffs, bug fixing, circuit sizing, query performance)...'
                          : 'Ask anything (Enter to send, Shift+Enter for newline) [Max 250 tokens]...'
                      }
                      rows={2}
                      className="pr-20 text-xs resize-none"
                    />
                    <div className="absolute right-2 bottom-2">
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={!chatInput.trim() || chatMutation.isPending}
                        className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-xs cursor-pointer"
                        leftIcon={chatMutation.isPending ? <Spinner size="sm" /> : <Send className="w-3.5 h-3.5" />}
                      >
                        Send
                      </Button>
                    </div>
                  </div>
                  {!isAdmin && (
                    <p className="text-[10px] text-text-muted flex items-center gap-1">
                      <Info className="w-3 h-3 text-amber-600" />
                      Member mode enforces ultra-low token consumption (max 250 tokens per reply).
                    </p>
                  )}
                </form>
              </div>
            </div>
          )}

          {/* TAB 2: BUG & TASK AUTO-RESOLVER */}
          {activeTab === 'bug_resolver' && (
            <div className="space-y-5">
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
                  <label className="block text-xs font-semibold text-text-secondary mb-1">
                    Custom Focus / Stack Trace (Optional)
                  </label>
                  <input
                    type="text"
                    value={customInstruction}
                    onChange={(e) => setCustomInstruction(e.target.value)}
                    placeholder="e.g. Focus on query indexing or verify I2C timing..."
                    className="w-full text-xs rounded-md border border-border bg-white px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    variant="primary"
                    size="sm"
                    className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-xs cursor-pointer"
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
                    className="border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100 cursor-pointer"
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
                  <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        Root Cause Diagnosis
                      </span>
                      <div className="flex items-center gap-2">
                        {bugSolution.tokens_used && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                            ⚡ {bugSolution.tokens_used} tokens
                          </span>
                        )}
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white text-text-muted border border-amber-200">
                          {bugSolution.issue_type}
                        </span>
                      </div>
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
                        Resolution Plan
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

                  {/* Code Fixes */}
                  {bugSolution.code_fixes && bugSolution.code_fixes.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                        <FileCode className="w-3.5 h-3.5 text-blue-600" />
                        Recommended Code Patches
                      </h4>
                      {bugSolution.code_fixes.map((cf, idx) => (
                        <div key={idx} className="border border-border rounded-lg overflow-hidden">
                          <div className="bg-slate-800 text-slate-200 px-3 py-1.5 text-[11px] font-mono flex items-center justify-between">
                            <span>{cf.file_path || cf.description || 'Patch'}</span>
                            <button
                              onClick={() => handleCopy(cf.code_snippet, idx + 100)}
                              className="text-slate-400 hover:text-white flex items-center gap-1 text-[10px] cursor-pointer"
                            >
                              {copiedIndex === idx + 100 ? (
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
                            {cf.code_snippet}
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
          )}

          {/* TAB 3: PROJECT & CIRCUIT COPILOT */}
          {activeTab === 'project_advisor' && (
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
                  className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-xs cursor-pointer"
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
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                        Technical Solution &amp; Recommendations
                      </h4>
                      {advisorSolution.tokens_used && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                          ⚡ {advisorSolution.tokens_used} tokens
                        </span>
                      )}
                    </div>
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
