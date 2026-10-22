import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Task, TaskComment, Attachment, TimeEntry, TaskStatus, Priority } from '../../types';
import { api } from '../../lib/api';
import { StatusBadge } from './StatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { Input } from '../ui/Input';
import { DatePicker } from '../ui/DatePicker';
import { Spinner } from '../ui/Spinner';
import { EmptyState } from '../ui/EmptyState';
import { formatDate, formatRelativeTime, formatDuration, formatFileSize, isOverdue } from '../../lib/utils';
import {
  Calendar,
  Clock,
  GitCommit,
  GitPullRequest,
  Paperclip,
  Trash2,
  Download,
  Send,
  Plus,
  CheckCircle2,
  ExternalLink,
  Edit2,
  User,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface TaskDetailProps {
  taskId: string;
  onEdit?: (task: Task) => void;
  onClose?: () => void;
}

export const TaskDetail: React.FC<TaskDetailProps> = ({ taskId, onEdit, onClose }) => {
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState('');
  const [isLoggingTime, setIsLoggingTime] = useState(false);
  const [logHours, setLogHours] = useState('');
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [logDescription, setLogDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // 1. Fetch Task
  const {
    data: task,
    isLoading: isLoadingTask,
    error: taskError,
  } = useQuery({
    queryKey: ['tasks', taskId],
    queryFn: () => api.tasks.getTask(taskId),
  });

  // 2. Fetch Comments
  const {
    data: comments = [],
    isLoading: isLoadingComments,
  } = useQuery({
    queryKey: ['tasks', taskId, 'comments'],
    queryFn: () => api.tasks.getTaskComments(taskId),
  });

  // 3. Fetch Time Entries
  const {
    data: timeEntries = [],
    isLoading: isLoadingTimeEntries,
  } = useQuery({
    queryKey: ['time-entries', { task_id: taskId }],
    queryFn: () => api.tasks.getTimeEntries({ task_id: taskId }),
  });

  // 4. Fetch Attachments
  const {
    data: attachments = [],
    isLoading: isLoadingAttachments,
  } = useQuery({
    queryKey: ['attachments', { task_id: taskId }],
    queryFn: () => api.attachments.getAttachments({ task_id: taskId }),
  });

  // Add Comment Mutation
  const addCommentMutation = useMutation({
    mutationFn: (text: string) => api.tasks.addComment(taskId, text),
    onSuccess: () => {
      setCommentText('');
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId, 'comments'] });
      toast.success('Comment posted');
    },
    onError: () => toast.error('Failed to post comment'),
  });

  // Add Time Entry Mutation
  const addTimeEntryMutation = useMutation({
    mutationFn: (entry: { task_id: string; work_date: string; duration_hours: number; description?: string }) =>
      api.tasks.addTimeEntry(entry),
    onSuccess: () => {
      setIsLoggingTime(false);
      setLogHours('');
      setLogDescription('');
      queryClient.invalidateQueries({ queryKey: ['time-entries', { task_id: taskId }] });
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
      toast.success('Hours logged successfully');
    },
    onError: () => toast.error('Failed to log time entry'),
  });

  // Delete Time Entry Mutation
  const deleteTimeEntryMutation = useMutation({
    mutationFn: (id: string) => api.tasks.deleteTimeEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-entries', { task_id: taskId }] });
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId] });
      toast.success('Time entry removed');
    },
  });

  // Status Change Mutation
  const statusMutation = useMutation({
    mutationFn: (newStatus: TaskStatus) => api.tasks.updateTaskStatus(taskId, newStatus),
    onSuccess: (updated, newStatus) => {
      queryClient.setQueryData(['tasks', taskId], updated);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(`Status updated to ${newStatus}`);
    },
  });

  // Delete Attachment Mutation
  const deleteAttachmentMutation = useMutation({
    mutationFn: (id: string) => api.attachments.deleteAttachment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', { task_id: taskId }] });
      toast.success('Attachment deleted');
    },
    onError: () => toast.error('Failed to delete attachment'),
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side 25MB check
    if (file.size > 25 * 1024 * 1024) {
      toast.error('File size exceeds 25 MB limit.');
      return;
    }

    try {
      setIsUploading(true);
      await api.attachments.uploadAttachment(taskId, file);
      queryClient.invalidateQueries({ queryKey: ['attachments', { task_id: taskId }] });
      toast.success('File uploaded');
    } catch {
      toast.error('Failed to upload file');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  if (isLoadingTask) {
    return (
      <div className="p-12 flex flex-col items-center justify-center gap-3 bg-white rounded-lg border border-border">
        <Spinner size="lg" />
        <p className="text-xs text-text-muted">Loading engineering task details...</p>
      </div>
    );
  }

  if (taskError || !task) {
    return (
      <div className="p-8 bg-white rounded-lg border border-border">
        <EmptyState
          heading="Task Not Found"
          description="Could not locate task or you may not have permission to view it."
        />
      </div>
    );
  }

  const overdue = isOverdue(task.due_date, task.status);
  const totalLogged = timeEntries.reduce((sum, item) => sum + item.duration_hours, 0);

  return (
    <div className="w-full bg-white border border-border rounded-lg shadow-card overflow-hidden flex flex-col">
      {/* Header Banner */}
      <div className="px-6 py-4 border-b border-border bg-slate-50/70 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-bold text-copper-700 bg-copper-50 px-2 py-0.5 rounded border border-copper-200">
            #ENG-{task.task_number.toString().padStart(3, '0')}
          </span>
          <StatusBadge status={task.status} size="md" />
          <PriorityBadge priority={task.priority} size="md" />
        </div>

        <div className="flex items-center gap-2">
          {onEdit && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Edit2 className="w-3.5 h-3.5" />}
              onClick={() => onEdit(task)}
            >
              Edit Task
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border">
        {/* Left Column (2/3): Content, Specs, Git Refs, Comments */}
        <div className="lg:col-span-2 p-6 flex flex-col gap-6">
          {/* Title */}
          <div>
            <h2 className="text-lg font-bold text-text-primary tracking-tight">{task.title}</h2>
            {task.project && (
              <p className="text-xs text-text-muted mt-0.5">
                Project:{' '}
                <span className="font-medium text-text-secondary">{task.project.name}</span>
              </p>
            )}
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Technical Description &amp; Scope
            </h4>
            <div className="text-xs text-text-primary leading-relaxed bg-slate-50/60 p-3.5 rounded border border-border whitespace-pre-wrap">
              {task.description || <span className="text-text-muted italic">No description provided.</span>}
            </div>
          </div>

          {/* Acceptance Criteria */}
          <div className="flex flex-col gap-1.5">
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-copper-600" />
              Acceptance Criteria &amp; Test Specs
            </h4>
            <div className="text-xs text-text-primary leading-relaxed bg-amber-50/30 p-3.5 rounded border border-amber-200/50 whitespace-pre-wrap font-mono text-[11px]">
              {task.acceptance_criteria || (
                <span className="text-text-muted font-sans italic">No test criteria set.</span>
              )}
            </div>
          </div>

          {/* Git Refs / Linked Commits */}
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <GitCommit className="w-3.5 h-3.5 text-copper-600" />
              Linked Git Commits &amp; Pull Requests
            </h4>
            {task.git_refs && task.git_refs.length > 0 ? (
              <div className="divide-y divide-border border border-border rounded-md bg-white overflow-hidden text-xs">
                {task.git_refs.map((ref, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between gap-3 hover:bg-slate-50">
                    <div className="flex items-center gap-2 min-w-0">
                      {ref.type === 'pr' ? (
                        <GitPullRequest className="w-4 h-4 text-violet-600 shrink-0" />
                      ) : (
                        <GitCommit className="w-4 h-4 text-copper-600 shrink-0" />
                      )}
                      <span className="font-mono text-xs font-semibold text-text-primary">
                        {ref.ref.slice(0, 8)}
                      </span>
                      <span className="text-text-secondary truncate">{ref.message || 'No commit message'}</span>
                    </div>
                    {ref.url && (
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-text-muted hover:text-copper-700 shrink-0 p-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted italic bg-slate-50/60 p-2.5 rounded border border-border">
                No Git commits or PRs linked yet. Mention `#ENG-{task.task_number.toString().padStart(3, '0')}` in git commit messages.
              </p>
            )}
          </div>

          {/* Comment Thread */}
          <div className="flex flex-col gap-3 pt-4 border-t border-border">
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Discussion &amp; Updates ({comments.length})
            </h4>

            {/* Comment Form */}
            <div className="flex flex-col gap-2 bg-slate-50/60 p-3 rounded-lg border border-border">
              <Textarea
                placeholder="Leave an engineering note, bench test result, or question..."
                rows={2}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!commentText.trim()}
                  isLoading={addCommentMutation.isPending}
                  leftIcon={<Send className="w-3 h-3" />}
                  onClick={() => addCommentMutation.mutate(commentText)}
                >
                  Post Comment
                </Button>
              </div>
            </div>

            {/* Comments List */}
            {isLoadingComments ? (
              <div className="py-4 text-center">
                <Spinner size="sm" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-4">No comments yet.</p>
            ) : (
              <div className="flex flex-col gap-3 mt-1">
                {comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-2.5 text-xs">
                    <Avatar name={c.user?.full_name || 'User'} size="sm" />
                    <div className="flex-1 bg-white border border-border rounded-md p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-semibold text-text-primary">
                          {c.user?.full_name || 'Unknown User'}
                        </span>
                        <span className="text-[10px] text-text-muted">
                          {formatRelativeTime(c.created_at)}
                        </span>
                      </div>
                      <p className="text-text-secondary whitespace-pre-wrap leading-relaxed">
                        {c.content}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar (1/3): Metadata, Time Log, Attachments */}
        <div className="p-6 bg-slate-50/30 flex flex-col gap-6 text-xs">
          {/* Status Quick Switch */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
              Change Status
            </label>
            <select
              value={task.status}
              onChange={(e) => statusMutation.mutate(e.target.value as TaskStatus)}
              className="bg-white border border-border rounded-md px-3 py-1.5 text-xs font-medium text-text-primary focus:outline-none focus:ring-1 focus:ring-copper-500 cursor-pointer"
            >
              <option value="TODO">To Do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="IN_REVIEW">In Review</option>
              <option value="BLOCKED">Blocked</option>
              <option value="DONE">Done</option>
            </select>
          </div>

          {/* People */}
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
              People
            </span>

            {/* Assignee */}
            <div className="flex items-center justify-between">
              <span className="text-text-secondary flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-text-muted" />
                Assignee:
              </span>
              {task.assignee ? (
                <div className="flex items-center gap-1.5">
                  <Avatar name={task.assignee.full_name} size="xs" />
                  <span className="font-medium text-text-primary">{task.assignee.full_name}</span>
                </div>
              ) : (
                <span className="text-text-muted italic">Unassigned</span>
              )}
            </div>

            {/* Reviewer */}
            <div className="flex items-center justify-between">
              <span className="text-text-secondary flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-text-muted" />
                Reviewer:
              </span>
              {task.reviewer ? (
                <div className="flex items-center gap-1.5">
                  <Avatar name={task.reviewer.full_name} size="xs" />
                  <span className="font-medium text-text-primary">{task.reviewer.full_name}</span>
                </div>
              ) : (
                <span className="text-text-muted italic">None</span>
              )}
            </div>
          </div>

          {/* Dates */}
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
              Schedule
            </span>

            <div className="flex items-center justify-between">
              <span className="text-text-secondary flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-text-muted" />
                Start Date:
              </span>
              <span className="text-text-primary">{formatDate(task.start_date)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-secondary flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-text-muted" />
                Due Date:
              </span>
              <span className={overdue ? 'text-red-600 font-bold' : 'text-text-primary'}>
                {formatDate(task.due_date)} {overdue && '(Overdue)'}
              </span>
            </div>
          </div>

          {/* Time Tracking */}
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-copper-600" />
                Time Tracking
              </span>
              <button
                type="button"
                onClick={() => setIsLoggingTime(!isLoggingTime)}
                className="text-[11px] text-copper-700 hover:underline font-semibold"
              >
                {isLoggingTime ? 'Cancel' : '+ Log Hours'}
              </button>
            </div>

            <div className="bg-white p-3 rounded border border-border flex justify-between font-mono">
              <div>
                <span className="text-[10px] text-text-muted block uppercase">Logged</span>
                <span className="font-semibold text-sm text-text-primary">
                  {formatDuration(totalLogged)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-text-muted block uppercase">Estimated</span>
                <span className="font-semibold text-sm text-text-primary">
                  {formatDuration(task.estimated_hours || 0)}
                </span>
              </div>
            </div>

            {/* Time logging form */}
            {isLoggingTime && (
              <div className="bg-white p-3 rounded-md border border-copper-200 flex flex-col gap-2 animate-in fade-in">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Hours"
                    type="number"
                    step="0.25"
                    placeholder="e.g. 2.5"
                    value={logHours}
                    onChange={(e) => setLogHours(e.target.value)}
                  />
                  <DatePicker
                    label="Work Date"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                  />
                </div>
                <Input
                  label="Description"
                  placeholder="e.g. PCB DRC routing & power plane tuning"
                  value={logDescription}
                  onChange={(e) => setLogDescription(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!logHours || parseFloat(logHours) <= 0}
                  isLoading={addTimeEntryMutation.isPending}
                  onClick={() =>
                    addTimeEntryMutation.mutate({
                      task_id: taskId,
                      work_date: logDate,
                      duration_hours: parseFloat(logHours),
                      description: logDescription,
                    })
                  }
                >
                  Save Time Log
                </Button>
              </div>
            )}

            {/* Time Log Entries List */}
            {timeEntries.length > 0 && (
              <div className="max-h-36 overflow-y-auto divide-y divide-border border border-border rounded bg-white">
                {timeEntries.map((te) => (
                  <div key={te.id} className="p-2 flex items-center justify-between text-[11px]">
                    <div>
                      <span className="font-medium text-text-primary">
                        {formatDuration(te.duration_hours)}
                      </span>{' '}
                      <span className="text-text-muted">on {formatDate(te.work_date, 'MMM d')}</span>
                      {te.description && (
                        <p className="text-[10px] text-text-secondary truncate max-w-[150px]">
                          {te.description}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => deleteTimeEntryMutation.mutate(te.id)}
                      className="text-text-muted hover:text-red-600 p-1"
                      title="Delete log"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Attachments */}
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1">
                <Paperclip className="w-3.5 h-3.5 text-copper-600" />
                Attachments ({attachments.length})
              </span>
              <label className="text-[11px] text-copper-700 hover:underline font-semibold cursor-pointer flex items-center gap-1">
                <Upload className="w-3 h-3" />
                Upload
                <input
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isUploading}
                />
              </label>
            </div>

            {isUploading && (
              <div className="p-2 bg-copper-50 text-copper-800 rounded border border-copper-200 flex items-center gap-2">
                <Spinner size="xs" />
                <span className="text-[11px]">Uploading file (limit 25MB)...</span>
              </div>
            )}

            {attachments.length === 0 ? (
              <p className="text-text-muted italic text-[11px]">No attachments uploaded.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="p-2 bg-white border border-border rounded flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-text-primary truncate max-w-[160px]">
                        {att.filename}
                      </p>
                      <p className="text-[10px] text-text-muted">
                        {formatFileSize(att.file_size)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => api.attachments.downloadAttachment(att.id, att.filename)}
                        className="p-1 text-text-muted hover:text-copper-700"
                        title="Download"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteAttachmentMutation.mutate(att.id)}
                        className="p-1 text-text-muted hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
