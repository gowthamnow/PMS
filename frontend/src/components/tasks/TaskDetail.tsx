import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Task, TaskComment, Attachment, TimeEntry, TaskStatus, Priority } from '../../types';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { StatusBadge } from './StatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { MentionTextarea } from '../ui/MentionTextarea';
import { Input } from '../ui/Input';
import { DatePicker } from '../ui/DatePicker';
import { Spinner } from '../ui/Spinner';
import { EmptyState } from '../ui/EmptyState';
import { Modal } from '../ui/Modal';
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
  AlertTriangle,
  Mail,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { AIAutoSolveModal } from '../ai/AIAutoSolveModal';

export interface TaskDetailProps {
  taskId: string;
  onEdit?: (task: Task) => void;
  onClose?: () => void;
}

export const TaskDetail: React.FC<TaskDetailProps> = ({ taskId, onEdit, onClose }) => {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState('');
  const [isLoggingTime, setIsLoggingTime] = useState(false);
  const [logHours, setLogHours] = useState('');
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [logDescription, setLogDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDelayModalOpen, setIsDelayModalOpen] = useState(false);
  const [delayMessage, setDelayMessage] = useState('');
  const [isAISolveModalOpen, setIsAISolveModalOpen] = useState(false);

  const isAdminOrManager = currentUser?.role === 'ADMIN' || currentUser?.role === 'PROJECT_MANAGER';

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
  const { data: comments = [], isLoading: isLoadingComments } = useQuery({
    queryKey: ['task-comments', taskId],
    queryFn: () => api.tasks.getComments(taskId),
    refetchInterval: 15000,
  });

  // 3. Fetch Time Entries
  const { data: timeEntries = [], isLoading: isLoadingTimeEntries } = useQuery({
    queryKey: ['time-entries', { task_id: taskId }],
    queryFn: () => api.tasks.getTimeEntries({ task_id: taskId }),
  });

  // 4. Fetch Attachments
  const { data: attachments = [], isLoading: isLoadingAttachments } = useQuery({
    queryKey: ['attachments', { task_id: taskId }],
    queryFn: () => api.attachments.getAttachments({ task_id: taskId }),
  });

  // Comment Mutation
  const commentMutation = useMutation({
    mutationFn: (content: string) => api.tasks.addComment(taskId, content),
    onSuccess: () => {
      setCommentText('');
      queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] });
      toast.success('Comment posted');
    },
    onError: () => toast.error('Failed to post comment'),
  });

  // Log Time Mutation
  const logTimeMutation = useMutation({
    mutationFn: (entry: { task_id: string; duration_hours: number; date: string; description?: string }) =>
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

  // Delay Inquiry Mutation
  const delayInquiryMutation = useMutation({
    mutationFn: (msg: string) => api.tasks.sendDelayInquiry(taskId, msg),
    onSuccess: (res: any) => {
      setIsDelayModalOpen(false);
      setDelayMessage('');
      queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] });
      toast.success(res.message || 'Delay inquiry email dispatched with managers in CC!');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to dispatch delay inquiry');
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
  const safeTimeEntries: TimeEntry[] = Array.isArray(timeEntries)
    ? timeEntries
    : (timeEntries as any)?.items || [];
  const totalLogged = safeTimeEntries.reduce(
    (sum, item) => sum + (Number(item.duration_hours) || 0),
    0
  );

  return (
    <div className="w-full bg-white border border-border rounded-lg shadow-card overflow-hidden flex flex-col">
      {/* Header Banner */}
      <div className="px-6 py-4 border-b border-border bg-slate-50/70 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-bold text-copper-700 bg-copper-50 px-2 py-0.5 rounded border border-copper-200">
            #ENG-{task.task_number ? task.task_number.toString().padStart(3, '0') : (task.id ? task.id.slice(0, 6) : '000')}
          </span>
          <StatusBadge status={task.status} size="md" />
          <PriorityBadge priority={task.priority} size="md" />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-xs border-amber-600"
            leftIcon={<Sparkles className="w-3.5 h-3.5" />}
            onClick={() => setIsAISolveModalOpen(true)}
            title="Auto-solve this bug or task with Google Gemini AI"
          >
            AI Auto-Solve Bug
          </Button>

          {isAdminOrManager && task.assignee && (
            <Button
              variant="secondary"
              size="sm"
              className="bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
              leftIcon={<AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
              onClick={() => setIsDelayModalOpen(true)}
              title="Send an email to assignee asking why task is delayed"
            >
              Why Delay? (Send Inquiry)
            </Button>
          )}

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

          {/* Comments and Progress Logs Stream */}
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Bench Notes &amp; Updates ({comments.length})
            </h4>

            {/* Comment Post Box */}
            <div className="flex flex-col gap-2">
              <MentionTextarea
                placeholder="Document test progress, pinout measurements, or roadblocks (type @ to mention teammate)..."
                value={commentText}
                onValueChange={setCommentText}
                rows={3}
              />
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Send className="w-3.5 h-3.5" />}
                  disabled={!commentText.trim()}
                  isLoading={commentMutation.isPending}
                  onClick={() => commentMutation.mutate(commentText)}
                >
                  Post Update
                </Button>
              </div>
            </div>

            {/* Comments List */}
            {isLoadingComments ? (
              <div className="py-6 text-center">
                <Spinner size="sm" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-xs text-text-muted italic py-4">No comments logged yet.</p>
            ) : (
              <div className="divide-y divide-border border border-border rounded-lg bg-white overflow-hidden text-xs">
                {comments.map((c) => (
                  <div key={c.id} className="p-3.5 flex flex-col gap-1.5 hover:bg-slate-50/50">
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <Avatar name={c.user?.full_name || 'Engineer'} size="xs" />
                        <span className="font-semibold text-text-primary">
                          {c.user?.full_name || c.user?.username}
                        </span>
                      </div>
                      <span className="text-text-muted">{formatRelativeTime(c.created_at)}</span>
                    </div>
                    <p className="text-text-primary whitespace-pre-wrap leading-relaxed pl-6">
                      {c.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1/3): Metadata & Time Entries */}
        <div className="p-6 flex flex-col gap-5 bg-slate-50/30">
          {/* Status Quick Changer */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Status Pipeline
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'] as TaskStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => statusMutation.mutate(st)}
                  className={`px-2 py-1.5 rounded text-xs font-medium border text-left transition-all ${
                    task.status === st
                      ? 'bg-copper-600 text-white border-copper-700 shadow-xs'
                      : 'bg-white text-text-secondary border-border hover:bg-slate-100'
                  }`}
                >
                  {st.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <hr className="border-border" />

          {/* Assignee Details */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Assigned Engineer
            </span>
            {task.assignee ? (
              <div className="flex items-center gap-2.5 p-2 bg-white rounded border border-border">
                <Avatar name={task.assignee.full_name || task.assignee.username} size="sm" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-text-primary truncate">
                    {task.assignee.full_name || task.assignee.username}
                  </span>
                  <span className="text-[11px] text-text-muted truncate">
                    {task.assignee.email}
                  </span>
                </div>
              </div>
            ) : (
              <span className="text-xs text-text-muted italic">Unassigned</span>
            )}
          </div>

          {/* Dates & Deadlines */}
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-text-muted flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>Target Due Date</span>
              </span>
              <span className={`font-mono font-semibold ${overdue ? 'text-red-600' : 'text-text-primary'}`}>
                {task.due_date ? formatDate(task.due_date) : 'None'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-muted flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Estimated Time</span>
              </span>
              <span className="font-mono text-text-primary">
                {task.estimated_hours ? `${task.estimated_hours}h` : '0h'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-muted flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-copper-600" />
                <span>Logged Time</span>
              </span>
              <span className="font-mono font-bold text-copper-700">
                {totalLogged.toFixed(1)}h
              </span>
            </div>
          </div>

          <hr className="border-border" />

          {/* Timesheet Quick Logger */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Work Hours Logger
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsLoggingTime(!isLoggingTime)}
                className="text-xs text-copper-700 p-0 h-auto"
              >
                {isLoggingTime ? 'Cancel' : '+ Log Hours'}
              </Button>
            </div>

            {isLoggingTime && (
              <div className="p-3 bg-white border border-border rounded flex flex-col gap-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Hours (e.g. 2.5)"
                    type="number"
                    step="0.25"
                    value={logHours}
                    onChange={(e) => setLogHours(e.target.value)}
                  />
                  <Input
                    label="Date"
                    type="date"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                  />
                </div>
                <Input
                  label="Bench Notes / Summary"
                  placeholder="Soldering, scope probe testing..."
                  value={logDescription}
                  onChange={(e) => setLogDescription(e.target.value)}
                />
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!logHours}
                  isLoading={logTimeMutation.isPending}
                  onClick={() =>
                    logTimeMutation.mutate({
                      task_id: taskId,
                      duration_hours: parseFloat(logHours),
                      date: logDate,
                      description: logDescription,
                    })
                  }
                >
                  Record Hours
                </Button>
              </div>
            )}
          </div>

          <hr className="border-border" />

          {/* File Attachments */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Attachments ({attachments.length})
              </span>
              <label className="text-xs text-copper-700 hover:text-copper-800 cursor-pointer font-medium">
                + Upload
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
              </label>
            </div>

            {attachments.length === 0 ? (
              <p className="text-text-muted italic text-[11px]">No attachments uploaded.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="p-2 bg-white border border-border rounded flex items-center justify-between gap-2 text-xs"
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

      {/* Delay Explanation Inquiry Modal */}
      {isDelayModalOpen && (
        <Modal
          isOpen={isDelayModalOpen}
          onClose={() => setIsDelayModalOpen(false)}
          title="Dispatch Task Delay Explanation Inquiry"
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setIsDelayModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="bg-red-600 hover:bg-red-700"
                isLoading={delayInquiryMutation.isPending}
                onClick={() => delayInquiryMutation.mutate(delayMessage)}
              >
                Dispatch Delay Inquiry Email
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4 text-xs">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-900 leading-relaxed">
              This will send an urgent inquiry email to <strong>{task.assignee?.full_name} ({task.assignee?.email})</strong> with Project Managers in CC, requesting an immediate status report on schedule delay and roadblocks.
            </div>

            <div>
              <label className="font-semibold text-text-secondary block mb-1">
                Custom Inquiry Note / Specific Roadblock Question (Optional):
              </label>
              <Textarea
                placeholder="e.g. Please clarify why the firmware bench testing was delayed past target freeze date..."
                value={delayMessage}
                onChange={(e) => setDelayMessage(e.target.value)}
                rows={4}
              />
            </div>
          </div>
        </Modal>
      )}

      {/* AI Auto-Solve Bug Modal */}
      <AIAutoSolveModal
        isOpen={isAISolveModalOpen}
        onClose={() => setIsAISolveModalOpen(false)}
        taskId={task.id}
        taskTitle={task.title}
        onCommentPosted={() => {
          queryClient.invalidateQueries({ queryKey: ['task-comments', task.id] });
        }}
      />
    </div>
  );
};

export default TaskDetail;
