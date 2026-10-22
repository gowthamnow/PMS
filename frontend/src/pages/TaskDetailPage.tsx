import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { TaskDetail } from '../components/tasks/TaskDetail';
import { TaskModal, TaskFormData } from '../components/tasks/TaskModal';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

export const TaskDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const { data: task } = useQuery({
    queryKey: ['tasks', id],
    queryFn: () => api.tasks.getTask(id!),
    enabled: !!id,
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects', { page: 1, page_size: 50 }],
    queryFn: () => api.projects.getProjects({ page: 1, page_size: 50 }),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users', { page: 1, page_size: 50 }],
    queryFn: () => api.users.getUsers(1, 50),
  });

  const updateMutation = useMutation({
    mutationFn: (data: TaskFormData) => api.tasks.updateTask(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setIsEditModalOpen(false);
      toast.success('Task updated');
    },
    onError: () => toast.error('Failed to update task'),
  });

  if (!id) return null;

  return (
    <div className="flex flex-col gap-5">
      {/* Back button & context */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded hover:bg-slate-100 text-text-muted hover:text-text-primary transition-colors"
          title="Go back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="text-xs text-text-secondary flex items-center gap-1.5">
          {task?.project ? (
            <Link
              to={`/projects/${task.project_id}`}
              className="hover:text-copper-700 font-medium"
            >
              {task.project.name}
            </Link>
          ) : (
            <span>Tasks</span>
          )}
          <span>/</span>
          <span className="font-mono text-text-primary font-semibold">
            #ENG-{task?.task_number ? task.task_number.toString().padStart(3, '0') : id.slice(0, 6)}
          </span>
        </div>
      </div>

      {/* Task Detail Card */}
      <TaskDetail
        taskId={id}
        onEdit={() => setIsEditModalOpen(true)}
        onClose={() => navigate(-1)}
      />

      {/* Edit Modal */}
      {task && (
        <TaskModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          task={task}
          projects={projectsData?.items || []}
          users={usersData?.items || []}
          onSubmit={async (data) => {
            await updateMutation.mutateAsync(data);
          }}
        />
      )}
    </div>
  );
};
