import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  format,
  formatDistanceToNow,
  parseISO,
  isAfter,
  isBefore,
  addDays,
  startOfDay,
} from 'date-fns';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(
  date: string | Date | undefined | null,
  formatStr: string = 'MMM d, yyyy'
): string {
  if (!date) return '';
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    if (isNaN(d.getTime())) return '';
    return format(d, formatStr);
  } catch {
    return '';
  }
}

export function formatRelativeTime(date: string | Date | undefined | null): string {
  if (!date) return '';
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    if (isNaN(d.getTime())) return '';
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return '';
  }
}

export function formatFileSize(bytes: number | undefined | null): string {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDuration(hours: number | undefined | null): string {
  if (hours === undefined || hours === null || isNaN(hours) || hours === 0) return '0h';
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  if (minutes === 0) return `${wholeHours}h`;
  if (wholeHours === 0) return `${minutes}m`;
  return `${wholeHours}h ${minutes}m`;
}

export function isOverdue(dueDate: string | Date | undefined | null, status?: string): boolean {
  if (!dueDate || status === 'DONE') return false;
  try {
    const d = typeof dueDate === 'string' ? parseISO(dueDate) : dueDate;
    if (isNaN(d.getTime())) return false;
    return isBefore(d, startOfDay(new Date()));
  } catch {
    return false;
  }
}

export function isDueSoon(
  dueDate: string | Date | undefined | null,
  status?: string,
  days: number = 3
): boolean {
  if (!dueDate || status === 'DONE') return false;
  try {
    const d = typeof dueDate === 'string' ? parseISO(dueDate) : dueDate;
    if (isNaN(d.getTime())) return false;
    const today = startOfDay(new Date());
    const threshold = addDays(today, days);
    return isAfter(d, today) && isBefore(d, threshold);
  } catch {
    return false;
  }
}

export function getInitials(name: string | undefined | null): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
