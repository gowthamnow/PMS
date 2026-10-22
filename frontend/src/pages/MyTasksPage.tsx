import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Task, TaskStatus } from '../types';
import { TaskRow } from '../components/tasks/TaskRow';
import { TaskFilters, TaskFilterValues } from '../components/tasks/TaskFilters';
import { TaskModal, TaskFormData } from '../components/tasks/TaskModal';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { CheckSquare, Plus } from 'lucide-react';

export const MyTasksPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [filters, setFilters] = useState<TaskFilterValues>({
    search: '',
    status: [],
    priority: [],
    assignee_id: user?.id || '',
  });

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // Fetch tasks assigned to current user
  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'my-tasks', { ...filters, user_id: user?.id }],
    queryFn: () =>
      api.tasks.getTasks({
        assignee_id: user?.id,
        search: filters.search || undefined,
        status: filters.status.length > 0 ? filters.status : undefined,
        priority: filters.priority.length > 0 ? filters.priority : undefined,
        page: 1,
        page_size: 50,
      }),
    enabled: !!user?.id,
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects', { page: 1, page_size: 50 }],
    queryFn: () => api.projects.getProjects({ page: 1, page_size: 50 }),
  });

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">My Engineering Tasks</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Hardware deliverables, firmware modules, and tests assigned to you.
          </p>
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

      {/* Filter Bar */}
      <TaskFilters filters={filters} onChange={setFilters} />

      {/* Task Table */}
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
                <th className="w-28 px-4 py-2.5 text-right">Logged / Est</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <Spinner size="md" />
                  </td>
                </tr>
              ) : !data?.items || data.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-text-muted italic">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <CheckSquare className="w-6 h-6 text-slate-300" />
                      <span>No tasks assigned to you right now.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                data.items.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onClick={(t) => navigate(`/tasks/${t.id}`)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Task Modal */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSubmit={async (taskData) => {
          await api.tasks.createTask({ ...taskData, assignee_id: user?.id });
        }}
        projects={projectsData?.items || []}
        users={user ? [user] : []}
      />
    </div>
  );
};
