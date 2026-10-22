import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Task, TaskStatus, Priority } from '../types';
import { TaskRow } from '../components/tasks/TaskRow';
import { TaskFilters, TaskFilterValues } from '../components/tasks/TaskFilters';
import { TaskModal, TaskFormData } from '../components/tasks/TaskModal';
import { StatusBadge } from '../components/tasks/StatusBadge';
import { PriorityBadge } from '../components/tasks/PriorityBadge';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { formatDate, formatDuration, isOverdue, isDueSoon } from '../lib/utils';
import {
  CheckSquare,
  Plus,
  LayoutGrid,
  List,
  Calendar,
  Clock,
  ArrowUpRight,
  User as UserIcon,
  Filter,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const MyTasksPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [scope, setScope] = useState<'my' | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const [filters, setFilters] = useState<TaskFilterValues>({
    search: '',
    status: [],
    priority: [],
    assignee_id: '',
  });

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // Fetch tasks
  const { data, isLoading } = useQuery({
    queryKey: ['tasks', { scope, ...filters, user_id: user?.id }],
    queryFn: () =>
      api.tasks.getTasks({
        assignee_id: scope === 'my' ? user?.id : (filters.assignee_id || undefined),
        search: filters.search || undefined,
        status: filters.status.length > 0 ? filters.status : undefined,
        priority: filters.priority.length > 0 ? filters.priority : undefined,
        page: 1,
        page_size: 100,
      }),
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects', { page: 1, page_size: 50 }],
    queryFn: () => api.projects.getProjects({ page: 1, page_size: 50 }),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users', { page: 1, page_size: 50 }],
    queryFn: () => api.users.getUsers(1, 50),
  });

  const createTaskMutation = useMutation({
    mutationFn: (data: TaskFormData) => api.tasks.createTask(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setIsTaskModalOpen(false);
      toast.success('Task created successfully');
    },
    onError: () => toast.error('Failed to create task'),
  });

  const tasksList = data?.items || [];

  return (
    <div className="flex flex-col gap-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-border">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Engineering Task Workspace</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Hardware deliverables, PCB milestones, firmware drivers, and tests across projects.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Scope Toggle: All Tasks vs My Tasks */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                scope === 'all'
                  ? 'bg-white shadow-xs text-copper-700'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Project Tasks
            </button>
            <button
              type="button"
              onClick={() => setScope('my')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                scope === 'my'
                  ? 'bg-white shadow-xs text-copper-700'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Assigned to Me
            </button>
          </div>

          {/* View Mode: Box Grid vs Table */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              title="Box Tile View"
              className={`p-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'grid'
                  ? 'bg-white shadow-xs text-copper-700'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              title="Table List View"
              className={`p-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'table'
                  ? 'bg-white shadow-xs text-copper-700'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsTaskModalOpen(true)}
          >
            Create Task
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <TaskFilters filters={filters} onChange={setFilters} />

      {/* Task Content: Loading / Empty / Grid / Table */}
      {isLoading ? (
        <div className="p-16 flex flex-col items-center justify-center gap-3 bg-white rounded-lg border border-border shadow-xs">
          <Spinner size="lg" />
          <p className="text-xs text-text-muted">Loading engineering tasks...</p>
        </div>
      ) : tasksList.length === 0 ? (
        <div className="p-12 bg-white rounded-lg border border-border shadow-xs text-center">
          <EmptyState
            heading="No Tasks Found"
            description={
              scope === 'my'
                ? "You don't have any tasks assigned right now. Switch to 'All Project Tasks' or create a new task."
                : "No tasks match the selected filter criteria."
            }
          />
        </div>
      ) : viewMode === 'grid' ? (
        /* Box / Card Tile Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tasksList.map((task) => {
            const overdue = isOverdue(task.due_date, task.status);
            const dueSoon = isDueSoon(task.due_date, task.status);
            const taskNum = task.task_number ? task.task_number.toString().padStart(3, '0') : task.id.slice(0, 6);

            return (
              <div
                key={task.id}
                onClick={() => navigate(`/tasks/${task.id}`)}
                className="group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-xs hover:shadow-md hover:border-copper-400 transition-all duration-200 cursor-pointer min-h-[200px]"
              >
                {/* Header: Task # & Badges */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-copper-700 bg-copper-50 px-2 py-0.5 rounded border border-copper-200">
                      #ENG-{taskNum}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <PriorityBadge priority={task.priority} size="sm" />
                      <div className="w-6 h-6 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 group-hover:bg-copper-600 group-hover:text-white transition-colors">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-sm font-semibold text-slate-900 group-hover:text-copper-700 transition-colors line-clamp-2 leading-snug">
                    {task.title}
                  </h3>

                  {/* Status Badge */}
                  <div>
                    <StatusBadge status={task.status} size="sm" />
                  </div>
                </div>

                {/* Footer Section */}
                <div className="pt-3 mt-3 border-t border-slate-100 flex flex-col gap-2 text-xs">
                  <div className="flex items-center justify-between text-slate-500 text-[11px]">
                    {/* Due Date */}
                    {task.due_date ? (
                      <div
                        className={`flex items-center gap-1 font-medium ${
                          overdue
                            ? 'text-red-600 font-semibold'
                            : dueSoon
                            ? 'text-amber-600 font-semibold'
                            : 'text-slate-500'
                        }`}
                      >
                        <Calendar className="w-3 h-3" />
                        <span>{formatDate(task.due_date, 'MMM d, yyyy')}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">No deadline</span>
                    )}

                    {/* Logged Hours */}
                    <div className="flex items-center gap-1 text-slate-600 font-mono">
                      <Clock className="w-3 h-3 text-copper-600" />
                      <span>{formatDuration(task.logged_hours || 0)}</span>
                    </div>
                  </div>

                  {/* Assignee */}
                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <span className="text-slate-400 text-[10px] uppercase font-mono tracking-wider">
                      Assignee
                    </span>
                    {task.assignee ? (
                      <div className="flex items-center gap-1.5">
                        <Avatar name={task.assignee.full_name} size="xs" />
                        <span className="font-medium text-slate-700 truncate max-w-[120px]">
                          {task.assignee.full_name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">Unassigned</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table List View */
        <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-slate-50 font-semibold text-text-secondary uppercase tracking-wider">
                  <th className="w-10 px-4 py-2.5 text-center">#</th>
                  <th className="w-24 px-4 py-2.5">ID</th>
                  <th className="px-4 py-2.5">Title</th>
                  <th className="w-32 px-4 py-2.5">Status</th>
                  <th className="w-28 px-4 py-2.5">Priority</th>
                  <th className="w-36 px-4 py-2.5">Assignee</th>
                  <th className="w-28 px-4 py-2.5">Due Date</th>
                  <th className="w-28 px-4 py-2.5 text-right">Logged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tasksList.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onClick={(t) => navigate(`/tasks/${t.id}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Task Creation Modal */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSubmit={async (taskData) => {
          await createTaskMutation.mutateAsync(taskData);
        }}
        projects={projectsData?.items || []}
        users={usersData?.items || (user ? [user] : [])}
      />
    </div>
  );
};

export default MyTasksPage;
