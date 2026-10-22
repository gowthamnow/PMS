import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task } from '../../types';
import { PriorityBadge } from './PriorityBadge';
import { Avatar } from '../ui/Avatar';
import { formatDate, isOverdue, isDueSoon, cn } from '../../lib/utils';
import { GitCommit, MessageSquare, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface TaskCardProps {
  task: Task;
  onClick?: (task: Task) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, onClick }) => {
  const navigate = useNavigate();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const overdue = isOverdue(task.due_date, task.status);
  const dueSoon = isDueSoon(task.due_date, task.status);

  const handleClick = (e: React.MouseEvent) => {
    // If not dragging, trigger click
    if (onClick) {
      onClick(task);
    } else {
      navigate(`/tasks/${task.id}`);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={cn(
        'bg-white border border-border rounded-md p-3 shadow-subtle hover:border-slate-300 hover:shadow-card transition-all cursor-grab active:cursor-grabbing select-none flex flex-col gap-2',
        isDragging && 'opacity-50 border-copper-400 shadow-modal ring-1 ring-copper-400 rotate-1'
      )}
    >
      {/* Top row: Task number & priority badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-text-muted hover:text-copper-700">
          #ENG-{task.task_number.toString().padStart(3, '0')}
        </span>
        <PriorityBadge priority={task.priority} size="sm" />
      </div>

      {/* Task title */}
      <h4 className="text-xs font-semibold text-text-primary leading-snug line-clamp-2">
        {task.title}
      </h4>

      {/* Bottom row: Indicators & Assignee */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[11px]">
        <div className="flex items-center gap-2.5">
          {/* Due date */}
          {task.due_date && (
            <div
              className={cn(
                'flex items-center gap-1 font-medium',
                overdue
                  ? 'text-red-600 font-semibold'
                  : dueSoon
                  ? 'text-copper-700 font-semibold'
                  : 'text-text-muted'
              )}
              title={overdue ? 'Overdue' : dueSoon ? 'Due this week' : 'Due date'}
            >
              <Calendar className="w-3 h-3" />
              <span>{formatDate(task.due_date, 'MMM d')}</span>
            </div>
          )}

          {/* Git refs indicator */}
          {task.git_refs && task.git_refs.length > 0 && (
            <div
              className="flex items-center gap-0.5 text-text-secondary"
              title={`${task.git_refs.length} linked commit(s) / PR(s)`}
            >
              <GitCommit className="w-3 h-3 text-copper-600" />
              <span className="font-mono text-[10px]">{task.git_refs.length}</span>
            </div>
          )}

          {/* Comment count indicator */}
          {task.comment_count !== undefined && task.comment_count > 0 && (
            <div
              className="flex items-center gap-0.5 text-text-muted"
              title={`${task.comment_count} comment(s)`}
            >
              <MessageSquare className="w-3 h-3" />
              <span className="font-mono text-[10px]">{task.comment_count}</span>
            </div>
          )}
        </div>

        {/* Assignee Avatar */}
        <div className="shrink-0">
          {task.assignee ? (
            <Avatar name={task.assignee.full_name} size="xs" />
          ) : (
            <div
              className="w-5 h-5 rounded-full border border-dashed border-slate-300 flex items-center justify-center text-[9px] text-text-muted"
              title="Unassigned"
            >
              —
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
