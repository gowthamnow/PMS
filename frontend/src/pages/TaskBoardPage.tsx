import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { api } from '../lib/api';
import { Task, TaskStatus } from '../types';
import { KANBAN_COLUMNS, STATUS_LABELS } from '../lib/constants';
import { TaskCard } from '../components/tasks/TaskCard';
import { TaskFilters, TaskFilterValues } from '../components/tasks/TaskFilters';
import { TaskModal, TaskFormData } from '../components/tasks/TaskModal';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { Plus, ListFilter, LayoutGrid, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

interface KanbanColumnProps {
  id: TaskStatus;
  title: string;
  tasks: Task[];
  onAddTask?: () => void;
  onTaskClick?: (task: Task) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({
  id,
  title,
  tasks,
  onAddTask,
  onTaskClick,
}) => {
  const { setNodeRef } = useDroppable({ id });

  const dotColors: Record<TaskStatus, string> = {
    TODO: 'bg-slate-400',
    IN_PROGRESS: 'bg-blue-600',
    IN_REVIEW: 'bg-violet-600',
    BLOCKED: 'bg-red-600',
    DONE: 'bg-green-600',
  };

  return (
    <div
      ref={setNodeRef}
      className="flex flex-col w-72 shrink-0 bg-slate-100/70 border border-border rounded-lg max-h-[calc(100vh-230px)] flex-1 overflow-hidden"
    >
      {/* Column Header */}
      <div className="p-3 bg-white border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dotColors[id]}`} />
          <h4 className="text-xs font-bold text-text-primary tracking-tight">{title}</h4>
          <span className="font-mono text-[11px] text-text-muted bg-slate-100 px-1.5 py-0.2 rounded-full">
            {tasks.length}
          </span>
        </div>
        {id === 'TODO' && onAddTask && (
          <button
            onClick={onAddTask}
            className="p-1 rounded text-text-muted hover:text-copper-700 hover:bg-copper-50 transition-colors"
            title="Add task in To Do"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Task List (Sortable Area) */}
      <div className="p-2.5 flex-1 overflow-y-auto flex flex-col gap-2.5">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={onTaskClick} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="py-8 text-center text-xs text-text-muted italic border border-dashed border-slate-200 rounded">
            Empty
          </div>
        )}
      </div>
    </div>
  );
};

export const TaskBoardPage: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [targetColumnStatus, setTargetColumnStatus] = useState<TaskStatus>('TODO');

  const [filters, setFilters] = useState<TaskFilterValues>({
    search: '',
    status: [],
    priority: [],
    assignee_id: '',
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // 1. Fetch Project
  const { data: project } = useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => api.projects.getProject(projectId!),
    enabled: !!projectId,
  });

  // 2. Fetch Tasks
  const {
    data: tasksData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['tasks', { project_id: projectId, ...filters }],
    queryFn: () =>
      api.tasks.getTasks({
        project_id: projectId,
        search: filters.search || undefined,
        status: filters.status.length > 0 ? filters.status : undefined,
        priority: filters.priority.length > 0 ? filters.priority : undefined,
        assignee_id: filters.assignee_id || undefined,
        page: 1,
        page_size: 100,
      }),
    enabled: !!projectId,
  });

  // 3. Fetch Users for filters
  const { data: usersData } = useQuery({
    queryKey: ['users', { page: 1, page_size: 100 }],
    queryFn: () => api.users.getUsers(1, 100),
  });

  // Status mutation with optimistic update
  const statusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      api.tasks.updateTaskStatus(taskId, status),
    onMutate: async ({ taskId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      const previous = queryClient.getQueryData(['tasks', { project_id: projectId, ...filters }]);

      // Optimistically update
      queryClient.setQueryData(
        ['tasks', { project_id: projectId, ...filters }],
        (old: any) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.map((t: Task) => (t.id === taskId ? { ...t, status } : t)),
          };
        }
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ['tasks', { project_id: projectId, ...filters }],
          context.previous
        );
      }
      toast.error('Failed to update task status');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'stats'] });
    },
  });

  // Task creation mutation
  const createTaskMutation = useMutation({
    mutationFn: (data: TaskFormData) => api.tasks.createTask(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setIsTaskModalOpen(false);
      toast.success('Task added');
    },
  });

  const allTasks: Task[] = tasksData?.items || [];

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = allTasks.find((t) => t.id === active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const taskId = active.id as string;
    const overId = over.id as string;

    // Check if dropped directly on a column or on another task card
    let targetStatus: TaskStatus | undefined;

    if (KANBAN_COLUMNS.includes(overId as TaskStatus)) {
      targetStatus = overId as TaskStatus;
    } else {
      const overTask = allTasks.find((t) => t.id === overId);
      if (overTask) {
        targetStatus = overTask.status;
      }
    }

    if (targetStatus) {
      const currentTask = allTasks.find((t) => t.id === taskId);
      if (currentTask && currentTask.status !== targetStatus) {
        statusMutation.mutate({ taskId, status: targetStatus });
      }
    }
  };

  if (error) {
    return (
      <ErrorState
        title="Could not load Kanban Board"
        message="Please check your connection and try again."
        onRetry={refetch}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Link
            to={`/projects/${projectId}`}
            className="p-1.5 rounded hover:bg-slate-100 text-text-muted hover:text-text-primary transition-colors"
            title="Back to Project Overview"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">Kanban Board /</span>
              <h1 className="text-base font-bold text-text-primary tracking-tight">
                {project?.name || 'Project'}
              </h1>
            </div>
            <p className="text-[11px] text-text-secondary mt-0.5">
              Drag tasks across workflow stages to update status
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link to={`/projects/${projectId}?tab=tasks`}>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<ListFilter className="w-3.5 h-3.5" />}
            >
              List View
            </Button>
          </Link>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => {
              setTargetColumnStatus('TODO');
              setIsTaskModalOpen(true);
            }}
          >
            New Task
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <TaskFilters
        filters={filters}
        onChange={setFilters}
        users={usersData?.items || []}
      />

      {/* Kanban Board Container */}
      {isLoading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3">
          <Spinner size="lg" />
          <p className="text-xs text-text-muted">Loading workflow board...</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4 pt-1">
            {KANBAN_COLUMNS.map((columnStatus) => {
              const columnTasks = allTasks.filter((t) => t.status === columnStatus);
              return (
                <KanbanColumn
                  key={columnStatus}
                  id={columnStatus}
                  title={STATUS_LABELS[columnStatus]}
                  tasks={columnTasks}
                  onAddTask={() => {
                    setTargetColumnStatus(columnStatus);
                    setIsTaskModalOpen(true);
                  }}
                  onTaskClick={(t) => navigate(`/tasks/${t.id}`)}
                />
              );
            })}
          </div>

          <DragOverlay>
            {activeTask ? <TaskCard task={activeTask} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Create Task Modal */}
      {project && (
        <TaskModal
          isOpen={isTaskModalOpen}
          onClose={() => setIsTaskModalOpen(false)}
          onSubmit={async (data) => {
            await createTaskMutation.mutateAsync(data);
          }}
          projects={[project]}
          users={usersData?.items || []}
          defaultProjectId={project.id}
          defaultStatus={targetColumnStatus}
        />
      )}
    </div>
  );
};
