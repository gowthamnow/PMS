import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { WorkloadItem, Task } from '../types';
import { Table, Column } from '../components/ui/Table';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { StatusBadge } from '../components/tasks/StatusBadge';
import { PriorityBadge } from '../components/tasks/PriorityBadge';
import { formatDate } from '../lib/utils';
import {
  Users,
  Download,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Clock,
  CheckCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const TeamPage: React.FC = () => {
  const { user } = useAuth();
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // Fetch Team Workload
  const {
    data: workload = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['reports', 'team-workload', { project_id: selectedProjectId, workspace_id: user?.workspace_id }],
    queryFn: () => api.reports.getTeamWorkload(),
  });

  // Fetch Projects for filter
  const { data: projectsData } = useQuery({
    queryKey: ['projects', { page: 1, page_size: 50, workspace_id: user?.workspace_id }],
    queryFn: () => api.projects.getProjects({ page: 1, page_size: 50 }),
  });

  // Fetch expanded user's tasks
  const { data: userTasksData, isLoading: isLoadingUserTasks } = useQuery({
    queryKey: ['tasks', { assignee_id: expandedUserId }],
    queryFn: () =>
      api.tasks.getTasks({
        assignee_id: expandedUserId || undefined,
        page: 1,
        page_size: 20,
      }),
    enabled: !!expandedUserId,
  });

  const handleExportCSV = async () => {
    try {
      await api.reports.exportCSV('workload', { project_id: selectedProjectId || undefined });
      toast.success('Team workload CSV exported');
    } catch {
      toast.error('Failed to export CSV');
    }
  };

  const toggleExpand = (userId: string) => {
    setExpandedUserId(expandedUserId === userId ? null : userId);
  };

  const safeWorkload: WorkloadItem[] = Array.isArray(workload)
    ? workload
    : (workload && Array.isArray((workload as any).items) ? (workload as any).items : []);

  const totalEngineers = safeWorkload.length;
  const totalOpenTasks = safeWorkload.reduce(
    (sum, w) => sum + (Number(w.todo || 0) + Number(w.in_progress || 0) + Number(w.in_review || 0) + Number(w.blocked || 0)),
    0
  );
  const totalBlockedOrOverdue = safeWorkload.reduce((sum, w) => sum + Number(w.blocked || 0), 0);

  if (error) {
    return (
      <ErrorState
        title="Could not load team workload"
        message="Please check server connection."
        onRetry={refetch}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-text-primary tracking-tight">Team Progress &amp; Capacity</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-copper-100 text-copper-800 border border-copper-200">
              🏢 {user?.workspace_name || 'All Workspaces (Global)'}
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            Monitor engineering capacity, assigned workload, and logged hours.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Download className="w-3.5 h-3.5" />}
          onClick={handleExportCSV}
        >
          Export CSV
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border border-border shadow-subtle flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Total Engineers
            </span>
            <div className="text-2xl font-bold font-mono text-text-primary mt-1">
              {isLoading ? <Spinner size="sm" /> : totalEngineers}
            </div>
          </div>
          <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-700">
            <Users className="w-4 h-4 text-copper-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-border shadow-subtle flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Active / Open Tasks
            </span>
            <div className="text-2xl font-bold font-mono text-text-primary mt-1">
              {isLoading ? <Spinner size="sm" /> : totalOpenTasks}
            </div>
          </div>
          <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-border shadow-subtle flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Blocked Tasks
            </span>
            <div
              className={`text-2xl font-bold font-mono mt-1 ${
                totalBlockedOrOverdue > 0 ? 'text-red-600' : 'text-text-primary'
              }`}
            >
              {isLoading ? <Spinner size="sm" /> : totalBlockedOrOverdue}
            </div>
          </div>
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center ${
              totalBlockedOrOverdue > 0
                ? 'bg-red-100 text-red-600'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3 border border-border rounded-lg shadow-subtle flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-text-secondary">Filter by Project:</span>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="text-xs bg-slate-50 border border-border rounded-md px-3 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-copper-500 cursor-pointer"
          >
            <option value="">All Projects</option>
            {projectsData?.items?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Team Table with Expandable Rows */}
      <div className="bg-white border border-border rounded-lg shadow-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-slate-50 font-semibold text-text-secondary uppercase tracking-wider">
                <th className="w-10 px-4 py-2.5 text-center" />
                <th className="px-4 py-2.5">Engineer</th>
                <th className="w-24 px-4 py-2.5 text-center">To Do</th>
                <th className="w-28 px-4 py-2.5 text-center">In Progress</th>
                <th className="w-24 px-4 py-2.5 text-center">In Review</th>
                <th className="w-24 px-4 py-2.5 text-center">Blocked</th>
                <th className="w-24 px-4 py-2.5 text-center">Done</th>
                <th className="w-32 px-4 py-2.5 text-right">Hours This Week</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <Spinner size="md" />
                  </td>
                </tr>
              ) : safeWorkload.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-text-muted italic">
                    No engineers found.
                  </td>
                </tr>
              ) : (
                safeWorkload.map((item, idx) => {
                  const userId = item.user?.id || item.user_id || `user-${idx}`;
                  const fullName = item.user?.full_name || item.full_name || item.username || 'Engineer';
                  const email = item.user?.email || item.email || (item.username ? `${item.username}@engineering.local` : '');
                  const isExpanded = expandedUserId === userId;
                  return (
                    <React.Fragment key={userId}>
                      <tr
                        onClick={() => toggleExpand(userId)}
                        className={`hover:bg-slate-50/70 transition-colors cursor-pointer ${
                          isExpanded ? 'bg-slate-50/90' : ''
                        }`}
                      >
                        <td className="px-4 py-3 text-center text-text-muted">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-copper-600" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={fullName} size="sm" />
                            <div>
                              <p className="font-semibold text-text-primary">
                                {fullName}
                              </p>
                              <p className="text-[10px] text-text-muted">{email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center font-mono font-medium text-slate-600">
                          {item.todo}
                        </td>
                        <td className="px-4 py-3 text-center font-mono font-semibold text-blue-600">
                          {item.in_progress}
                        </td>
                        <td className="px-4 py-3 text-center font-mono font-medium text-violet-600">
                          {item.in_review}
                        </td>
                        <td
                          className={`px-4 py-3 text-center font-mono font-bold ${
                            item.blocked > 0 ? 'text-red-600' : 'text-slate-400'
                          }`}
                        >
                          {item.blocked}
                        </td>
                        <td className="px-4 py-3 text-center font-mono font-medium text-green-600">
                          {item.done}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-copper-700">
                          {item.hours_this_week}h
                        </td>
                      </tr>

                      {/* Expandable Task Sub-row */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="p-4 bg-slate-50/50 border-b border-border">
                            <div className="bg-white border border-border rounded-md p-3">
                              <h5 className="text-[11px] font-bold text-text-secondary uppercase tracking-wider mb-2">
                                Current Tasks Assigned to {fullName}
                              </h5>
                              {isLoadingUserTasks ? (
                                <div className="py-4 text-center">
                                  <Spinner size="sm" />
                                </div>
                              ) : !userTasksData?.items || userTasksData.items.length === 0 ? (
                                <p className="text-xs text-text-muted italic py-2">
                                  No active tasks currently assigned.
                                </p>
                              ) : (
                                <div className="divide-y divide-border text-xs">
                                  {userTasksData.items.map((t) => (
                                    <div
                                      key={t.id}
                                      className="py-2 flex items-center justify-between gap-4"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono text-xs font-semibold text-text-muted">
                                          #ENG-{t.task_number ? t.task_number.toString().padStart(3, '0') : (t.id ? t.id.slice(0, 6) : '000')}
                                        </span>
                                        <span className="font-medium text-text-primary">
                                          {t.title}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <StatusBadge status={t.status} size="sm" />
                                        <PriorityBadge priority={t.priority} size="sm" />
                                        <span className="text-text-muted text-[11px]">
                                          Due: {formatDate(t.due_date, 'MMM d')}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
