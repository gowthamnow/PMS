import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { format } from 'date-fns';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { ProgressDonut } from '../components/charts/ProgressDonut';
import { WorkloadBar } from '../components/charts/WorkloadBar';
import { formatRelativeTime, formatDate } from '../lib/utils';
import { Task, TaskStatus, Priority } from '../types';
import toast from 'react-hot-toast';
import {
  FolderOpen,
  CheckSquare,
  AlertOctagon,
  Clock,
  ArrowRight,
  GitCommit,
  GitPullRequest,
  MessageSquare,
  PlusCircle,
  Activity,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Play,
  Send,
  Sparkles,
  Layers,
  Cpu,
  Plus,
  Trash2,
  Bell,
  Sun,
  Sunset,
} from 'lucide-react';

interface DayPlanItem {
  id: string;
  text: string;
  completed: boolean;
  taskId?: string;
}

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const todayFormatted = format(new Date(), 'EEEE, MMMM d, yyyy');
  const isAdmin = user?.role === 'ADMIN';

  // State for Day Plan (persisted in localStorage per user)
  const [dayPlan, setDayPlan] = useState<DayPlanItem[]>(() => {
    if (!user) return [];
    const saved = localStorage.getItem(`pms_day_plan_${user.id}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [
      { id: '1', text: 'Review priority engineering tasks for today', completed: false },
      { id: '2', text: 'Inspect hardware schematics & check pinouts', completed: false },
    ];
  });
  const [newPlanText, setNewPlanText] = useState('');

  useEffect(() => {
    if (user) {
      localStorage.setItem(`pms_day_plan_${user.id}`, JSON.stringify(dayPlan));
    }
  }, [dayPlan, user]);

  const toggleDayPlanItem = (id: string) => {
    setDayPlan((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item))
    );
  };

  const addDayPlanItem = (text: string, taskId?: string) => {
    if (!text.trim()) return;
    setDayPlan((prev) => [
      ...prev,
      { id: Date.now().toString(), text: text.trim(), completed: false, taskId },
    ]);
    setNewPlanText('');
    toast.success('Added to Day Plan');
  };

  const removeDayPlanItem = (id: string) => {
    setDayPlan((prev) => prev.filter((item) => item.id !== id));
  };

  // Queries
  const {
    data: stats,
    isLoading: isLoadingStats,
    error: statsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => api.dashboard.getStats(),
  });

  const {
    data: projectsData,
    isLoading: isLoadingProjects,
  } = useQuery({
    queryKey: ['projects', { page: 1, page_size: 6 }],
    queryFn: () => api.projects.getProjects({ page: 1, page_size: 6 }),
  });

  const {
    data: userTasksData,
    isLoading: isLoadingUserTasks,
  } = useQuery({
    queryKey: ['tasks', { assignee_id: user?.id, page: 1, page_size: 50 }],
    queryFn: () =>
      api.tasks.getTasks({
        assignee_id: user?.id,
        page: 1,
        page_size: 50,
      }),
    enabled: !!user,
  });

  const {
    data: timeEntriesData,
  } = useQuery({
    queryKey: ['timeEntries', { user_id: user?.id }],
    queryFn: () => api.tasks.getTimeEntries({ user_id: user?.id }),
    enabled: !!user,
  });

  const {
    data: activities = [],
    isLoading: isLoadingActivity,
  } = useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: () => api.dashboard.getActivity(15),
  });

  // Action mutation: Send team reminders
  const [isSendingReminder, setIsSendingReminder] = useState(false);
  const handleTriggerReminders = async (type: 'stale' | 'morning' | 'evening') => {
    setIsSendingReminder(true);
    try {
      if (type === 'morning') {
        const res = await api.tasks.triggerMorningReminder(true);
        toast.success(`Morning kickoff dispatched to ${res.reminders_sent || 0} engineer(s)`);
      } else if (type === 'evening') {
        const res = await api.tasks.triggerEveningReminder();
        toast.success(`Evening wrap-up dispatched to ${res.reminders_sent || 0} engineer(s)`);
      } else {
        const res = await api.tasks.checkStaleNotifications(undefined, true);
        toast.success(`Pending task reminders dispatched to ${res.reminders_sent || 0} assignee(s)`);
      }
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch {
      toast.error('Failed to trigger reminders');
    } finally {
      setIsSendingReminder(false);
    }
  };

  if (statsError) {
    return (
      <div className="py-8">
        <ErrorState
          title="Could not load engineering dashboard"
          message="Ensure your backend service is running and accessible."
          onRetry={refetchStats}
        />
      </div>
    );
  }

  // Engineer calculations
  const myTasks = userTasksData?.items || [];
  const priorityTasks = myTasks.filter(
    (t) => t.status !== 'DONE' && (t.priority === 'CRITICAL' || t.priority === 'HIGH')
  );
  const nextAssignedTasks = myTasks.filter((t) => t.status === 'TODO');
  const pendingByStatus = {
    in_progress: myTasks.filter((t) => t.status === 'IN_PROGRESS').length,
    in_review: myTasks.filter((t) => t.status === 'IN_REVIEW').length,
    blocked: myTasks.filter((t) => t.status === 'BLOCKED').length,
    todo: myTasks.filter((t) => t.status === 'TODO').length,
    done: myTasks.filter((t) => t.status === 'DONE').length,
  };

  // Hours calculated from time entries
  const todayDateStr = format(new Date(), 'yyyy-MM-dd');
  const safeTimeEntries: any[] = Array.isArray(timeEntriesData)
    ? timeEntriesData
    : (timeEntriesData as any)?.items || [];
  const hoursLoggedToday = safeTimeEntries
    .filter((e) => e.work_date === todayDateStr)
    .reduce((sum, e) => sum + Number(e.duration_hours || 0), 0);
  const hoursThisWeek = safeTimeEntries.reduce((sum, e) => sum + Number(e.duration_hours || 0), 0);

  // Priority project (first active project assigned)
  const myProjects = projectsData?.items || [];
  const priorityProject = myProjects[0];

  return (
    <div className="flex flex-col gap-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-text-primary tracking-tight">
              {isAdmin ? 'Engineering Operations Hub' : `Welcome Back, ${user?.full_name || 'Engineer'}`}
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-copper-100 text-copper-800 border border-copper-200">
              {isAdmin ? 'System Administrator' : 'Engineering Workspace'}
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-0.5 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-copper-600" />
            <span>{todayFormatted}</span>
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSendingReminder}
                onClick={() => handleTriggerReminders('morning')}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-slate-50 text-text-primary transition-colors inline-flex items-center gap-1.5 shadow-2xs"
                title="Send 8:30-9:30 AM Morning Login Reminder"
              >
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                <span>Morning Kickoff</span>
              </button>
              <button
                type="button"
                disabled={isSendingReminder}
                onClick={() => handleTriggerReminders('evening')}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-slate-50 text-text-primary transition-colors inline-flex items-center gap-1.5 shadow-2xs"
                title="Send 4:00-5:30 PM Evening Git Push & Update Reminder"
              >
                <Sunset className="w-3.5 h-3.5 text-orange-500" />
                <span>Evening Wrap-up</span>
              </button>
              <button
                type="button"
                disabled={isSendingReminder}
                onClick={() => handleTriggerReminders('stale')}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 transition-colors inline-flex items-center gap-1.5 shadow-2xs"
              >
                <Send className="w-3.5 h-3.5 text-amber-700" />
                <span>Send Stale Reminders</span>
              </button>
            </div>
          ) : (
            <Link
              to="/timesheet"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-copper-600 hover:bg-copper-700 text-white transition-colors inline-flex items-center gap-1.5 shadow-xs"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Log Bench Hours</span>
            </Link>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 1. INDIVIDUAL ENGINEER VIEW */}
      {/* ======================================================== */}
      {!isAdmin ? (
        <div className="flex flex-col gap-6">
          {/* Top Row: Focus Project & Work Hours */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Spotlight Card: Priority Project */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50/60 to-amber-50/30 p-5 shadow-xs relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                <Cpu className="w-32 h-32 text-amber-600" />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-200">
                    <Sparkles className="w-3 h-3 text-amber-600" />
                    Priority Focus Project
                  </span>
                  {priorityProject && (
                    <Badge variant="project" value={priorityProject.status} size="sm" />
                  )}
                </div>

                {priorityProject ? (
                  <div>
                    <h2 className="text-lg font-bold text-text-primary tracking-tight">
                      {priorityProject.name}
                    </h2>
                    <p className="text-xs text-text-muted mt-1 line-clamp-2 max-w-xl">
                      {priorityProject.description || priorityProject.objectives || 'Active engineering project.'}
                    </p>

                    <div className="mt-4 p-3 rounded-xl bg-white/90 border border-slate-200/80 shadow-2xs">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-semibold text-text-secondary">Project Completion</span>
                        <span className="font-mono font-bold text-text-primary">
                          {priorityProject.task_count
                            ? Math.round(
                                ((priorityProject.completed_task_count || 0) /
                                  priorityProject.task_count) *
                                  100
                              )
                            : 0}
                          %
                        </span>
                      </div>
                      <ProgressBar
                        value={
                          priorityProject.task_count
                            ? Math.round(
                                ((priorityProject.completed_task_count || 0) /
                                  priorityProject.task_count) *
                                  100
                              )
                            : 0
                        }
                        size="sm"
                        showPercentage={false}
                      />
                      <div className="flex items-center justify-between text-[11px] text-text-muted mt-1.5 font-mono">
                        <span>{priorityProject.completed_task_count || 0} tasks done</span>
                        <span>{priorityProject.task_count || 0} total tasks</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center text-text-muted text-xs italic">
                    No active projects assigned yet.
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
                <span className="text-text-muted font-medium">
                  {priorityProject?.target_date ? `Deadline: ${formatDate(priorityProject.target_date, 'MMM d, yyyy')}` : 'Sprint active'}
                </span>
                {priorityProject && (
                  <Link
                    to={`/projects/${priorityProject.id}`}
                    className="font-semibold text-copper-700 hover:text-copper-800 inline-flex items-center gap-1 text-xs"
                  >
                    <span>Open Project Deck</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            </div>

            {/* Work Hours & Pending Analysis */}
            <div className="flex flex-col gap-4">
              {/* Card 1: Today's Bench Hours */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
                    Today's Hours Logged
                  </span>
                  <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>

                <div className="my-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold font-mono text-text-primary">
                      {hoursLoggedToday.toFixed(1)}
                    </span>
                    <span className="text-xs text-text-muted font-mono">/ 8.0 hrs target</span>
                  </div>
                  <ProgressBar value={Math.min(100, Math.round((hoursLoggedToday / 8.0) * 100))} size="sm" showPercentage={false} />
                </div>

                <div className="text-[11px] text-text-muted flex justify-between font-mono pt-2 border-t border-slate-100">
                  <span>This Week: <strong>{hoursThisWeek.toFixed(1)}h</strong></span>
                  <Link to="/timesheet" className="text-copper-600 hover:underline">
                    Log Hours &rarr;
                  </Link>
                </div>
              </div>

              {/* Card 2: Pending Tasks Quick Count */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <span className="text-xs font-bold text-text-muted uppercase tracking-wider block mb-3">
                  Task Status Breakdown
                </span>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-blue-50 border border-blue-100">
                    <span className="text-xs text-blue-700 font-semibold block">In Prog</span>
                    <span className="text-lg font-bold font-mono text-blue-900">{pendingByStatus.in_progress}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-amber-50 border border-amber-100">
                    <span className="text-xs text-amber-700 font-semibold block">Blocked</span>
                    <span className="text-lg font-bold font-mono text-amber-900">{pendingByStatus.blocked}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-purple-50 border border-purple-100">
                    <span className="text-xs text-purple-700 font-semibold block">Review</span>
                    <span className="text-lg font-bold font-mono text-purple-900">{pendingByStatus.in_review}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-100">
                    <span className="text-xs text-emerald-700 font-semibold block">Done</span>
                    <span className="text-lg font-bold font-mono text-emerald-900">{pendingByStatus.done}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Middle Row: Day Plan (Interactive Checklist) & Priority Tasks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Day Plan Focus */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-copper-600" />
                    <h3 className="font-bold text-text-primary text-sm">Today's Day Plan</h3>
                  </div>
                  <span className="text-[11px] text-text-muted font-mono">
                    {dayPlan.filter((i) => i.completed).length}/{dayPlan.length} completed
                  </span>
                </div>

                {/* Checklist items */}
                <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto pr-1">
                  {dayPlan.length === 0 ? (
                    <p className="text-xs text-text-muted italic py-4 text-center">
                      Your day plan is empty. Add your daily goals below.
                    </p>
                  ) : (
                    dayPlan.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all ${
                          item.completed
                            ? 'bg-slate-50 border-slate-200 text-text-muted line-through'
                            : 'bg-white border-slate-200 hover:border-amber-300 text-text-primary shadow-2xs'
                        }`}
                      >
                        <label className="flex items-center gap-2.5 flex-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.completed}
                            onChange={() => toggleDayPlanItem(item.id)}
                            className="rounded border-slate-300 text-copper-600 focus:ring-copper-500 w-4 h-4"
                          />
                          <span className="font-medium select-none">{item.text}</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => removeDayPlanItem(item.id)}
                          className="text-slate-400 hover:text-red-500 p-1 transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add Day Plan Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addDayPlanItem(newPlanText);
                }}
                className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2"
              >
                <input
                  type="text"
                  placeholder="Add goal to today's plan..."
                  value={newPlanText}
                  onChange={(e) => setNewPlanText(e.target.value)}
                  className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-copper-500 focus:bg-white"
                />
                <button
                  type="submit"
                  disabled={!newPlanText.trim()}
                  className="px-3 py-2 bg-copper-600 hover:bg-copper-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </form>
            </div>

            {/* Priority Tasks List */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <AlertOctagon className="w-4 h-4 text-red-500" />
                    <h3 className="font-bold text-text-primary text-sm">High Priority Tasks</h3>
                  </div>
                  <Link to="/my-tasks" className="text-xs text-copper-600 hover:underline">
                    View All ({myTasks.length}) &rarr;
                  </Link>
                </div>

                <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto pr-1">
                  {priorityTasks.length === 0 ? (
                    <p className="text-xs text-text-muted italic py-6 text-center">
                      No urgent or critical tasks pending right now.
                    </p>
                  ) : (
                    priorityTasks.slice(0, 5).map((task) => (
                      <div
                        key={task.id}
                        className="p-3 rounded-xl border border-slate-200 hover:border-amber-400 bg-white hover:bg-slate-50/50 transition-all flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-text-muted font-bold">
                              #{task.task_number}
                            </span>
                            <Badge variant="priority" value={task.priority} size="sm" />
                            <Badge variant="status" value={task.status} size="sm" />
                          </div>
                          <Link
                            to={`/tasks/${task.id}`}
                            className="font-semibold text-xs text-text-primary hover:text-copper-700 truncate block mt-1"
                          >
                            {task.title}
                          </Link>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => addDayPlanItem(`Task #${task.task_number}: ${task.title}`, task.id)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-amber-50 hover:text-amber-700 text-text-muted text-[11px] font-medium inline-flex items-center gap-1 transition-colors"
                            title="Add to Day Plan"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Focus</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Next Assigned Tasks Queue */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-text-muted">
                <span>Backlog Queue: <strong>{nextAssignedTasks.length} tasks</strong> waiting in TODO</span>
                <Link to="/my-tasks" className="text-copper-700 font-semibold hover:underline">
                  Open Board &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ======================================================== */
        /* 2. SYSTEM ADMINISTRATOR EXECUTIVE VIEW                   */
        /* ======================================================== */
        <div className="flex flex-col gap-6">
          {/* Top 4 Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-border shadow-subtle flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Active Projects
                </span>
                <div className="text-2xl font-bold font-mono text-text-primary mt-1">
                  {isLoadingStats ? <Spinner size="sm" /> : stats?.active_projects || 0}
                </div>
              </div>
              <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center text-copper-600">
                <FolderOpen className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-border shadow-subtle flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Open Tasks
                </span>
                <div className="text-2xl font-bold font-mono text-text-primary mt-1">
                  {isLoadingStats ? (
                    <Spinner size="sm" />
                  ) : (
                    (stats?.tasks_by_status?.TODO || 0) +
                    (stats?.tasks_by_status?.IN_PROGRESS || 0) +
                    (stats?.tasks_by_status?.IN_REVIEW || 0) +
                    (stats?.tasks_by_status?.BLOCKED || 0)
                  )}
                </div>
              </div>
              <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                <CheckSquare className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-border shadow-subtle flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Overdue Tasks
                </span>
                <div
                  className={`text-2xl font-bold font-mono mt-1 ${
                    (stats?.overdue_tasks || 0) > 0 ? 'text-red-600' : 'text-text-primary'
                  }`}
                >
                  {isLoadingStats ? <Spinner size="sm" /> : stats?.overdue_tasks || 0}
                </div>
              </div>
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center ${
                  (stats?.overdue_tasks || 0) > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-700'
                }`}
              >
                <AlertOctagon className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-border shadow-subtle flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Logged This Week
                </span>
                <div className="text-2xl font-bold font-mono text-text-primary mt-1">
                  {isLoadingStats ? <Spinner size="sm" /> : `${stats?.hours_logged_this_week || 0}h`}
                </div>
              </div>
              <div className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Admin Mid Section: Project Progress & Team Workload */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Active Projects List */}
            <div className="bg-white p-5 rounded-xl border border-border shadow-subtle flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-border">
                  <h3 className="font-bold text-text-primary text-sm">Active Engineering Projects</h3>
                  <Link to="/projects" className="text-xs text-copper-600 hover:underline">
                    View All ({projectsData?.total || 0}) &rarr;
                  </Link>
                </div>

                <div className="flex flex-col gap-3">
                  {(projectsData?.items || []).slice(0, 5).map((project) => (
                    <div
                      key={project.id}
                      className="p-3 rounded-lg border border-slate-100 hover:border-slate-200 bg-slate-50/50 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <Link
                          to={`/projects/${project.id}`}
                          className="font-semibold text-xs text-text-primary hover:text-copper-700"
                        >
                          {project.name}
                        </Link>
                        <Badge variant="project" value={project.status} size="sm" />
                      </div>
                      <ProgressBar
                        value={
                          project.task_count
                            ? Math.round(((project.completed_task_count || 0) / project.task_count) * 100)
                            : 0
                        }
                        size="sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Team Capacity & Workload Bar Chart */}
            <div className="bg-white p-5 rounded-xl border border-border shadow-subtle flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-border">
                  <h3 className="font-bold text-text-primary text-sm">Team Workload Distribution</h3>
                  <Link to="/team" className="text-xs text-copper-600 hover:underline">
                    Team Directory &rarr;
                  </Link>
                </div>
                {stats?.workload_by_user && stats.workload_by_user.length > 0 ? (
                  <WorkloadBar data={stats.workload_by_user} />
                ) : (
                  <p className="text-xs text-text-muted italic py-12 text-center">
                    No workload data available.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Activity Stream */}
          <div className="bg-white p-5 rounded-xl border border-border shadow-subtle">
            <h3 className="font-bold text-text-primary text-sm pb-3 mb-3 border-b border-border flex items-center gap-2">
              <Activity className="w-4 h-4 text-copper-600" />
              <span>Real-Time Audit &amp; Engineering Activity</span>
            </h3>
            {isLoadingActivity ? (
              <div className="py-8 text-center"><Spinner size="sm" /></div>
            ) : activities.length === 0 ? (
              <p className="text-xs text-text-muted italic py-6 text-center">No recent activity.</p>
            ) : (
              <div className="flex flex-col divide-y divide-slate-100 text-xs">
                {activities.slice(0, 8).map((act: any) => (
                  <div key={act.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-copper-500" />
                      <span className="text-text-primary font-medium">{act.message}</span>
                    </div>
                    <span className="text-[11px] text-text-muted font-mono whitespace-nowrap">
                      {formatRelativeTime(act.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
