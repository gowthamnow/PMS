import React from 'react';
import { Task } from '../../types';
import { StatusBadge } from './StatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { Avatar } from '../ui/Avatar';
import { Trash2 } from 'lucide-react';
import { formatDate, isOverdue, formatDuration, cn } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';

export interface TaskRowProps {
  task: Task;
  isSelected?: boolean;
  onSelectChange?: (selected: boolean) => void;
  onClick?: (task: Task) => void;
  onDelete?: (task: Task) => void;
}

export const TaskRow: React.FC<TaskRowProps> = ({
  task,
  isSelected = false,
  onSelectChange,
  onClick,
  onDelete,
}) => {
  const navigate = useNavigate();
  const overdue = isOverdue(task.due_date, task.status);

  const handleClick = () => {
    if (onClick) {
      onClick(task);
    } else {
      navigate(`/tasks/${task.id}`);
    }
  };

  return (
    <tr
      onClick={handleClick}
      className={cn(
        'border-b border-border hover:bg-slate-50/70 transition-colors cursor-pointer group text-xs',
        isSelected && 'bg-copper-50/30'
      )}
    >
      {/* Checkbox column */}
      <td
        className="w-10 px-4 py-3 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelectChange?.(e.target.checked)}
          className="rounded border-border text-copper-600 focus:ring-copper-500 cursor-pointer"
        />
      </td>

      {/* Task Number */}
      <td className="w-24 px-4 py-3 font-mono font-semibold text-text-muted group-hover:text-copper-700 whitespace-nowrap">
        #ENG-{task.task_number ? task.task_number.toString().padStart(3, '0') : (task.id ? task.id.slice(0, 6) : '000')}
      </td>

      {/* Title */}
      <td className="px-4 py-3 font-medium text-text-primary min-w-[200px]">
        <span className="line-clamp-1">{task.title}</span>
      </td>

      {/* Status */}
      <td className="w-32 px-4 py-3 whitespace-nowrap">
        <StatusBadge status={task.status} size="sm" />
      </td>

      {/* Priority */}
      <td className="w-28 px-4 py-3 whitespace-nowrap">
        <PriorityBadge priority={task.priority} size="sm" />
      </td>

      {/* Assignee */}
      <td className="w-36 px-4 py-3 whitespace-nowrap">
        {task.assignee ? (
          <div className="flex items-center gap-2">
            <Avatar name={task.assignee.full_name} size="xs" />
            <span className="truncate max-w-[100px] text-text-secondary">
              {task.assignee.full_name}
            </span>
          </div>
        ) : (
          <span className="text-text-muted italic">Unassigned</span>
        )}
      </td>

      {/* Due Date */}
      <td
        className={cn(
          'w-28 px-4 py-3 whitespace-nowrap',
          overdue ? 'text-red-600 font-semibold' : 'text-text-secondary'
        )}
      >
        {task.due_date ? formatDate(task.due_date, 'MMM d, yyyy') : '—'}
      </td>

      {/* Hours Logged / Estimated */}
      <td className="w-28 px-4 py-3 font-mono text-right whitespace-nowrap text-text-secondary">
        <span>{formatDuration(task.logged_hours || 0)}</span>
        <span className="text-text-muted mx-1">/</span>
        <span className="text-text-muted">
          {task.estimated_hours ? formatDuration(task.estimated_hours) : '—'}
        </span>
      </td>
      {onDelete && (
        <td
          className="w-12 px-3 py-3 text-center whitespace-nowrap"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task);
          }}
        >
          <button
            type="button"
            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Delete Task (Admin)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </td>
      )}
    </tr>
  );
};
