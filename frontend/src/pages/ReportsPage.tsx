import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Tabs, TabItem } from '../components/ui/Tabs';
import { Button } from '../components/ui/Button';
import { Table, Column } from '../components/ui/Table';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { WorkloadBar } from '../components/charts/WorkloadBar';
import { formatDate, formatDuration } from '../lib/utils';
import {
  BarChart2,
  Download,
  FolderOpen,
  Users,
  Clock,
  AlertTriangle,
  Calendar,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const ReportsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('progress');

  // Filters for Time Log
  const [timeUserFilter, setTimeUserFilter] = useState('');
  const [timeProjectFilter, setTimeProjectFilter] = useState('');

  // 1. Fetch Project Progress
  const {
    data: progressData,
    isLoading: isLoadingProgress,
  } = useQuery({
    queryKey: ['reports', 'project-progress'],
    queryFn: () => api.reports.getProjectProgress(),
  });

  // 2. Fetch Team Workload
  const {
    data: workloadData = [],
    isLoading: isLoadingWorkload,
  } = useQuery({
    queryKey: ['reports', 'team-workload'],
    queryFn: () => api.reports.getTeamWorkload(),
  });

  // 3. Fetch Time Log
  const {
    data: timeLogs = [],
    isLoading: isLoadingTimeLogs,
  } = useQuery({
    queryKey: ['reports', 'time-log', { user_id: timeUserFilter, project_id: timeProjectFilter }],
    queryFn: () =>
      api.reports.getTimeLog({
        user_id: timeUserFilter || undefined,
        project_id: timeProjectFilter || undefined,
      }),
  });

  // 4. Fetch Overdue Tasks
  const {
    data: overdueTasks = [],
    isLoading: isLoadingOverdue,
  } = useQuery({
    queryKey: ['reports', 'overdue-tasks'],
    queryFn: () => api.reports.getOverdueTasks(),
  });

  // Fetch Users & Projects for selectors
  const { data: usersData } = useQuery({
    queryKey: ['users', { page: 1, page_size: 50 }],
    queryFn: () => api.users.getUsers(1, 50),
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects', { page: 1, page_size: 50 }],
    queryFn: () => api.projects.getProjects({ page: 1, page_size: 50 }),
  });

  const progressList = Array.isArray(progressData)
    ? progressData
    : ((progressData as any)?.projects || []);

  const safeWorkloadData = Array.isArray(workloadData) ? workloadData : [];
  const safeTimeLogs = Array.isArray(timeLogs) ? timeLogs : ((timeLogs as any)?.items || []);
  const safeOverdueTasks = Array.isArray(overdueTasks) ? overdueTasks : [];

  const handleExport = async (type: 'progress' | 'workload' | 'timelog' | 'overdue') => {
    try {
      await api.reports.exportCSV(type);
      toast.success(`${type.toUpperCase()} report exported`);
    } catch {
      toast.error('Failed to export CSV report');
    }
  };

  const tabs: TabItem[] = [
    { id: 'progress', label: 'Project Progress', icon: <FolderOpen className="w-4 h-4" /> },
    { id: 'workload', label: 'Team Workload', icon: <Users className="w-4 h-4" /> },
    { id: 'timelog', label: 'Time Log Entries', icon: <Clock className="w-4 h-4" /> },
    {
      id: 'overdue',
      label: 'Overdue Tasks',
      icon: <AlertTriangle className="w-4 h-4" />,
      count: safeOverdueTasks.length > 0 ? safeOverdueTasks.length : undefined,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Engineering Reports</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Deliverable metrics, team velocity, bench time tracking, and risk analysis.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Download className="w-3.5 h-3.5" />}
          onClick={() => handleExport(activeTab as any)}
        >
          Export {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} CSV
        </Button>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab 1: Project Progress */}
      {activeTab === 'progress' && (
        <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-slate-50 font-semibold text-text-secondary uppercase tracking-wider">
                  <th className="px-4 py-3">Project</th>
                  <th className="w-32 px-4 py-3">Status</th>
                  <th className="w-32 px-4 py-3 text-center">Completed / Total</th>
                  <th className="w-56 px-4 py-3">Progress</th>
                  <th className="w-32 px-4 py-3 text-center">Overdue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoadingProgress ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center">
                      <Spinner size="md" />
                    </td>
                  </tr>
                ) : progressList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-text-muted italic">
                      No project progress records available.
                    </td>
                  </tr>
                ) : (
                  progressList.map((proj: any) => {
                    const projName = proj.project_name || proj.name || 'Unnamed Project';
                    const completed = proj.completed_tasks ?? proj.completed ?? 0;
                    const total = proj.total_tasks ?? 0;
                    const pct = proj.percentage ?? proj.progress_percentage ?? 0;
                    const overdueCount = proj.overdue_count ?? 0;
                    return (
                      <tr key={proj.project_id || proj.id || projName} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-text-primary">{projName}</td>
                        <td className="px-4 py-3">
                          <Badge variant="project" value={proj.status || 'ACTIVE'} size="sm" />
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-text-secondary">
                          {completed} / {total}
                        </td>
                        <td className="px-4 py-3">
                          <ProgressBar
                            value={pct}
                            size="md"
                            showPercentage={true}
                          />
                        </td>
                        <td
                          className={`px-4 py-3 text-center font-mono font-bold ${
                            overdueCount > 0 ? 'text-red-600' : 'text-slate-400'
                          }`}
                        >
                          {overdueCount}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Team Workload */}
      {activeTab === 'workload' && (
        <div className="flex flex-col gap-6">
          <div className="bg-white p-5 border border-border rounded-lg shadow-subtle flex flex-col gap-3">
            <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">
              Engineering Workload Distribution
            </h3>
            <WorkloadBar data={safeWorkloadData} />
          </div>

          <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-slate-50 font-semibold text-text-secondary uppercase tracking-wider">
                    <th className="px-4 py-3">Engineer</th>
                    <th className="w-24 px-4 py-3 text-center">To Do</th>
                    <th className="w-28 px-4 py-3 text-center">In Progress</th>
                    <th className="w-24 px-4 py-3 text-center">In Review</th>
                    <th className="w-24 px-4 py-3 text-center">Blocked</th>
                    <th className="w-24 px-4 py-3 text-center">Done</th>
                    <th className="w-28 px-4 py-3 text-right">Total Tasks</th>
                    <th className="w-28 px-4 py-3 text-right">Logged Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoadingWorkload ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center">
                        <Spinner size="md" />
                      </td>
                    </tr>
                  ) : safeWorkloadData.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-text-muted italic">
                        No team workload data available.
                      </td>
                    </tr>
                  ) : (
                    safeWorkloadData.map((item: any) => {
                      const fullName = item.full_name || item.user?.full_name || item.username || 'Engineer';
                      const keyId = item.user_id || item.user?.id || item.username;
                      return (
                        <tr key={keyId} className="hover:bg-slate-50">
                          <td className="px-4 py-3 flex items-center gap-2">
                            <Avatar name={fullName} size="xs" />
                            <span className="font-semibold text-text-primary">
                              {fullName}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-slate-600">
                            {item.todo ?? item.tasks_by_status?.TODO ?? 0}
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-blue-600 font-semibold">
                            {item.in_progress ?? item.tasks_by_status?.IN_PROGRESS ?? 0}
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-violet-600">
                            {item.in_review ?? item.tasks_by_status?.IN_REVIEW ?? 0}
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-red-600 font-bold">
                            {item.blocked ?? item.tasks_by_status?.BLOCKED ?? 0}
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-green-600">
                            {item.done ?? item.tasks_by_status?.DONE ?? 0}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-text-primary">
                            {item.total_tasks ?? 0}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-copper-700">
                            {item.hours_this_week ?? item.logged_hours ?? 0}h
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Time Log */}

      {activeTab === 'timelog' && (
        <div className="flex flex-col gap-4">
          <div className="bg-white p-3 border border-border rounded-lg shadow-subtle flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold text-text-secondary">Filters:</span>
            <select
              value={timeUserFilter}
              onChange={(e) => setTimeUserFilter(e.target.value)}
              className="bg-slate-50 border border-border rounded-md px-2.5 py-1 text-text-primary"
            >
              <option value="">All Engineers</option>
              {usersData?.items?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>

            <select
              value={timeProjectFilter}
              onChange={(e) => setTimeProjectFilter(e.target.value)}
              className="bg-slate-50 border border-border rounded-md px-2.5 py-1 text-text-primary"
            >
              <option value="">All Projects</option>
              {projectsData?.items?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-slate-50 font-semibold text-text-secondary uppercase tracking-wider">
                    <th className="w-28 px-4 py-3">Date</th>
                    <th className="w-48 px-4 py-3">Engineer</th>
                    <th className="px-4 py-3">Task</th>
                    <th className="px-4 py-3">Bench Summary</th>
                    <th className="w-24 px-4 py-3 text-right">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoadingTimeLogs ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center">
                        <Spinner size="md" />
                      </td>
                    </tr>
                  ) : safeTimeLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-text-muted italic">
                        No time log entries recorded.
                      </td>
                    </tr>
                  ) : (
                    safeTimeLogs.map((entry: any) => {
                      const engName = entry.user_name || entry.user?.full_name || entry.user?.username || 'Engineer';
                      const taskTitle = entry.task_title || entry.task?.title || 'General Engineering';
                      const workDate = entry.work_date ? String(entry.work_date).slice(0, 10) : '—';
                      return (
                        <tr key={entry.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono text-text-secondary whitespace-nowrap">
                            {workDate}
                          </td>
                          <td className="px-4 py-3 flex items-center gap-2">
                            <Avatar name={engName} size="xs" />
                            <span className="font-medium text-text-primary">
                              {engName}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-text-primary">
                            {taskTitle}
                          </td>
                          <td className="px-4 py-3 text-text-secondary">
                            {entry.description || '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-copper-700 whitespace-nowrap">
                            {formatDuration(entry.duration_hours || 0)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Overdue Tasks */}
      {activeTab === 'overdue' && (
        <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-slate-50 font-semibold text-text-secondary uppercase tracking-wider">
                  <th className="w-24 px-4 py-3">Task ID</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="w-36 px-4 py-3">Project</th>
                  <th className="w-36 px-4 py-3">Assignee</th>
                  <th className="w-28 px-4 py-3">Due Date</th>
                  <th className="w-28 px-4 py-3 text-right">Overdue By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoadingOverdue ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <Spinner size="md" />
                    </td>
                  </tr>
                ) : safeOverdueTasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-green-700 font-medium">
                      ✓ No overdue tasks found. All deliverables are on track!
                    </td>
                  </tr>
                ) : (
                  safeOverdueTasks.map((t: any) => {
                    const assigneeName = t.assignee_name || t.assignee?.full_name || t.assignee?.username;
                    const projectName = t.project_name || t.project?.name || '—';
                    const dueDateStr = t.due_date ? formatDate(t.due_date, 'MMM d, yyyy') : '—';
                    return (
                      <tr key={t.id} className="hover:bg-red-50/20">
                        <td className="px-4 py-3 font-mono font-semibold text-red-600">
                          #ENG-{t.task_number ? t.task_number.toString().padStart(3, '0') : t.id.slice(0, 6)}
                        </td>
                        <td className="px-4 py-3 font-medium text-text-primary">{t.title}</td>
                        <td className="px-4 py-3 text-text-secondary">{projectName}</td>
                        <td className="px-4 py-3">
                          {assigneeName ? (
                            <div className="flex items-center gap-1.5">
                              <Avatar name={assigneeName} size="xs" />
                              <span>{assigneeName}</span>
                            </div>
                          ) : (
                            <span className="text-text-muted italic">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-red-600">
                          {dueDateStr}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-red-600">
                          {t.days_overdue ?? 0} days
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

            </table>
          </div>
        </div>
      )}
    </div>
  );
};
