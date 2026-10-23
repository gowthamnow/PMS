import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Select } from '../ui/Select';
import { DatePicker } from '../ui/DatePicker';
import { Button } from '../ui/Button';
import { Task, Project, User, TaskStatus, Priority } from '../../types';
import { STATUS_LABELS, PRIORITY_LABELS } from '../../lib/constants';

const taskSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  description: z.string().optional(),
  acceptance_criteria: z.string().optional(),
  project_id: z.string().min(1, 'Please select a project'),
  assignee_id: z.string().optional(),
  reviewer_id: z.string().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  start_date: z.string().optional(),
  due_date: z.string().optional(),
  estimated_hours: z.coerce.number().min(0).optional(),
});

export type TaskFormData = z.infer<typeof taskSchema>;

export interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TaskFormData) => Promise<void>;
  task?: Task | null;
  projects?: Project[];
  users?: User[];
  defaultProjectId?: string;
  defaultStatus?: TaskStatus;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  task,
  projects = [],
  users = [],
  defaultProjectId,
  defaultStatus = 'TODO',
}) => {
  const isEditing = !!task;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: '',
      description: '',
      acceptance_criteria: '',
      project_id: defaultProjectId || '',
      assignee_id: '',
      reviewer_id: '',
      status: defaultStatus,
      priority: 'MEDIUM',
      start_date: '',
      due_date: '',
      estimated_hours: 0,
    },
  });

  useEffect(() => {
    if (task) {
      reset({
        title: task.title,
        description: task.description || '',
        acceptance_criteria: task.acceptance_criteria || '',
        project_id: task.project_id,
        assignee_id: task.assignee_id || '',
        reviewer_id: task.reviewer_id || '',
        status: task.status,
        priority: task.priority,
        start_date: task.start_date ? task.start_date.slice(0, 10) : '',
        due_date: task.due_date ? task.due_date.slice(0, 10) : '',
        estimated_hours: task.estimated_hours || 0,
      });
    } else {
      reset({
        title: '',
        description: '',
        acceptance_criteria: '',
        project_id: defaultProjectId || (projects[0]?.id || ''),
        assignee_id: '',
        reviewer_id: '',
        status: defaultStatus,
        priority: 'MEDIUM',
        start_date: '',
        due_date: '',
        estimated_hours: 0,
      });
    }
  }, [task, defaultProjectId, defaultStatus, reset, projects]);

  const handleFormSubmit = async (data: TaskFormData) => {
    await onSubmit(data);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={isEditing ? `Edit Task #ENG-${task.task_number}` : 'Create New Engineering Task'}
      description="Fill in task details, criteria, assignee, and milestones."
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            isLoading={isSubmitting}
            onClick={handleSubmit(handleFormSubmit)}
            type="button"
          >
            {isEditing ? 'Save Changes' : 'Create Task'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col gap-4">
        {/* Title */}
        <Input
          label="Task Title"
          required
          placeholder="e.g. Layout Buck-Boost Converter stage on 4-layer PCB"
          error={errors.title?.message}
          {...register('title')}
        />

        {/* Project Select */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select
            label="Project"
            required
            error={errors.project_id?.message}
            {...register('project_id')}
          >
            <option value="">Select Project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>

          <Select
            label="Status"
            error={errors.status?.message}
            {...register('status')}
          >
            {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((st) => (
              <option key={st} value={st}>
                {STATUS_LABELS[st]}
              </option>
            ))}
          </Select>

          <Select
            label="Priority"
            error={errors.priority?.message}
            {...register('priority')}
          >
            {(Object.keys(PRIORITY_LABELS) as Priority[]).map((pr) => (
              <option key={pr} value={pr}>
                {PRIORITY_LABELS[pr]}
              </option>
            ))}
          </Select>
        </div>

        {/* Assignee & Reviewer */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Assignee (Lead Engineer)"
            error={errors.assignee_id?.message}
            {...register('assignee_id')}
          >
            <option value="">Unassigned</option>
            {users
              .slice()
              .sort((a, b) => {
                const aIsAi = a.username === 'ai_engineer' || (a.full_name && a.full_name.toLowerCase().includes('gemini'));
                const bIsAi = b.username === 'ai_engineer' || (b.full_name && b.full_name.toLowerCase().includes('gemini'));
                if (aIsAi && !bIsAi) return -1;
                if (!aIsAi && bIsAi) return 1;
                return (a.full_name || '').localeCompare(b.full_name || '');
              })
              .map((u) => {
                const isAi = u.username === 'ai_engineer' || (u.full_name && u.full_name.toLowerCase().includes('gemini'));
                return (
                  <option key={u.id} value={u.id}>
                    {isAi
                      ? `🤖 ${u.full_name} (AI Autonomous Engineer)`
                      : `${u.full_name} (${u.role})`}
                  </option>
                );
              })}
          </Select>

          <Select
            label="Reviewer (Code/Schematic Review)"
            error={errors.reviewer_id?.message}
            {...register('reviewer_id')}
          >
            <option value="">No Reviewer</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.role})
              </option>
            ))}
          </Select>
        </div>

        {/* Dates & Hours */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <DatePicker
            label="Start Date"
            error={errors.start_date?.message}
            {...register('start_date')}
          />
          <DatePicker
            label="Due Date"
            error={errors.due_date?.message}
            {...register('due_date')}
          />
          <Input
            label="Estimated Hours"
            type="number"
            step="0.5"
            placeholder="e.g. 12"
            error={errors.estimated_hours?.message}
            {...register('estimated_hours')}
          />
        </div>

        {/* Description */}
        <Textarea
          label="Description / Technical Scope"
          rows={3}
          placeholder="Detailed engineering specifications, pinouts, constraints..."
          error={errors.description?.message}
          {...register('description')}
        />

        {/* Acceptance Criteria */}
        <Textarea
          label="Acceptance Criteria / Test Specs"
          rows={3}
          placeholder="Test benches, signal integrity limits, DRC clean, firmware flash passed..."
          error={errors.acceptance_criteria?.message}
          {...register('acceptance_criteria')}
        />
      </form>
    </Modal>
  );
};
