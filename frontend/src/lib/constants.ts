import { TaskStatus, Priority, ProjectStatus, UserRole } from '../types';

export const KANBAN_COLUMNS: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  BLOCKED: 'Blocked',
  DONE: 'Done',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: 'Planning',
  ACTIVE: 'Active',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  TODO: 'bg-slate-100 text-slate-700 border-slate-300',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 border-blue-200',
  IN_REVIEW: 'bg-violet-50 text-violet-700 border-violet-200',
  BLOCKED: 'bg-red-50 text-red-700 border-red-200',
  DONE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  LOW: 'bg-slate-100 text-slate-600 border-slate-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
  CRITICAL: 'bg-red-50 text-red-700 border-red-200',
};

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  PLANNING: 'bg-slate-100 text-slate-700 border-slate-200',
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ON_HOLD: 'bg-amber-50 text-amber-700 border-amber-200',
  COMPLETED: 'bg-blue-50 text-blue-700 border-blue-200',
  ARCHIVED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  ADMIN: 'bg-purple-50 text-purple-700 border-purple-200',
  PROJECT_MANAGER: 'bg-blue-50 text-blue-700 border-blue-200',
  ENGINEER: 'bg-slate-100 text-slate-700 border-slate-200',
};
