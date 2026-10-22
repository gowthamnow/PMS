import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Task, ProjectMember, GiteaRepo, Attachment, TaskStatus, Priority } from '../types';
import { Tabs, TabItem } from '../components/ui/Tabs';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Table, Column } from '../components/ui/Table';
import { Avatar } from '../components/ui/Avatar';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { TaskRow } from '../components/tasks/TaskRow';
import { TaskFilters, TaskFilterValues } from '../components/tasks/TaskFilters';
import { TaskModal, TaskFormData } from '../components/tasks/TaskModal';
import { CommitList } from '../components/gitea/CommitList';
import { PullRequestList } from '../components/gitea/PullRequestList';
import { RepoLinker } from '../components/gitea/RepoLinker';
import { ProjectRepoCard } from '../components/gitea/ProjectRepoCard';
import { formatDate, formatFileSize, isOverdue } from '../lib/utils';
import {
  FolderOpen,
  Kanban,
  Plus,
  Users,
  GitBranch,
  FileText,
  Clock,
  Calendar,
  CheckCircle2,
  Trash2,
  Download,
  AlertTriangle,
  ExternalLink,
  Upload,
  BellRing,
} from 'lucide-react';
import toast from 'react-hot-toast';


export const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('overview');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [memberRole, setMemberRole] = useState('ENGINEER');

  // File Vault & Upload states
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [fileFilterCategory, setFileFilterCategory] = useState<string>('ALL');
  const [fileSearch, setFileSearch] = useState<string>('');

  // Task filters for Tasks tab
  const [taskFilters, setTaskFilters] = useState<TaskFilterValues>({
    search: '',
    status: [],
    priority: [],
    assignee_id: '',
  });


  const isManagerOrAdmin = user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER';

  // 1. Fetch Project Details
  const {
    data: project,
    isLoading: isLoadingProject,
    error: projectError,
  } = useQuery({
    queryKey: ['projects', id],
    queryFn: () => api.projects.getProject(id!),
    enabled: !!id,
  });

  // 2. Fetch Project Stats
  const { data: stats } = useQuery({
    queryKey: ['projects', id, 'stats'],
    queryFn: () => api.projects.getProjectStats(id!),
    enabled: !!id,
  });

  // 3. Fetch Tasks for this Project
  const { data: tasksData, isLoading: isLoadingTasks } = useQuery({
    queryKey: ['tasks', { project_id: id, ...taskFilters }],
    queryFn: () =>
      api.tasks.getTasks({
        project_id: id,
        search: taskFilters.search || undefined,
        status: taskFilters.status.length > 0 ? taskFilters.status : undefined,
        priority: taskFilters.priority.length > 0 ? taskFilters.priority : undefined,
        assignee_id: taskFilters.assignee_id || undefined,
        page: 1,
        page_size: 50,
      }),
    enabled: !!id,
  });

  // 4. Fetch Members
  const { data: members = [], isLoading: isLoadingMembers } = useQuery({
    queryKey: ['projects', id, 'members'],
    queryFn: () => api.projects.getProjectMembers(id!),
    enabled: !!id,
  });

  // 5. Fetch Users (for member adding & filter)
  const { data: allUsersData } = useQuery({
    queryKey: ['users', { page: 1, page_size: 100 }],
    queryFn: () => api.users.getUsers(1, 100),
  });

  // 6. Fetch Linked Gitea Repos
  const { data: repos = [], isLoading: isLoadingRepos } = useQuery({
    queryKey: ['gitea', 'repos', { project_id: id }],
    queryFn: () => api.gitea.getRepos(id),
    enabled: !!id,
  });

  // 7. Fetch Attachments
  const { data: attachments = [], isLoading: isLoadingAttachments } = useQuery({
    queryKey: ['attachments', { project_id: id }],
    queryFn: () => api.attachments.getAttachments({ project_id: id }),
    enabled: !!id,
  });

  // Create Task Mutation
  const createTaskMutation = useMutation({
    mutationFn: (data: TaskFormData) => api.tasks.createTask(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects', id, 'stats'] });
      setIsTaskModalOpen(false);
      toast.success('Task created successfully');
    },
    onError: () => toast.error('Failed to create task'),
  });

  // Add Member Mutation
  const addMemberMutation = useMutation({
    mutationFn: () => api.projects.addProjectMember(id!, selectedUserId, memberRole),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', id, 'members'] });
      setIsMemberModalOpen(false);
      setSelectedUserId('');
      toast.success('Member assigned to project');
    },
    onError: () => toast.error('Failed to add member'),
  });

  // Remove Member Mutation
  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => api.projects.removeProjectMember(id!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', id, 'members'] });
      toast.success('Member removed');
    },
  });

  // Link Gitea Repo Mutation
  const linkRepoMutation = useMutation({
    mutationFn: ({ fullName, url }: { fullName: string; url: string }) =>
      api.gitea.linkRepo(id!, fullName, url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gitea', 'repos', { project_id: id }] });
      toast.success('Repository linked');
    },
    onError: () => toast.error('Failed to link repo'),
  });

  // Unlink Repo Mutation
  const unlinkRepoMutation = useMutation({
    mutationFn: (repoId: string) => api.gitea.unlinkRepo(repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gitea', 'repos', { project_id: id }] });
      toast.success('Repository unlinked');
    },
  });

  // Project Document Upload Mutation
  const uploadFileMutation = useMutation({
    mutationFn: (file: File) => api.attachments.uploadAttachment({ projectId: id! }, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', { project_id: id }] });
      setIsUploadModalOpen(false);
      setFileToUpload(null);
      toast.success('Project document uploaded successfully');
    },
    onError: () => toast.error('Failed to upload file'),
  });

  // Project Document Delete Mutation
  const deleteFileMutation = useMutation({
    mutationFn: (attId: string) => api.attachments.deleteAttachment(attId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', { project_id: id }] });
      toast.success('File deleted');
    },
    onError: () => toast.error('Failed to delete file'),
  });

  // Stale Task Pending Reminders Trigger Mutation
  const sendStaleRemindersMutation = useMutation({
    mutationFn: () => api.tasks.checkStaleNotifications(24, true),
    onSuccess: (data: any) => {
      toast.success(`Dispatched ${data.reminders_sent} pending reminder(s) to assignees with managers in CC.`);
    },
    onError: () => toast.error('Failed to send pending reminders'),
  });


  if (isLoadingProject) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <Spinner size="lg" />
        <p className="text-xs text-text-muted">Loading project workspace...</p>
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <ErrorState
        title="Project Not Found"
        message="The requested project does not exist or has been removed."
        onRetry={() => navigate('/projects')}
      />
    );
  }

  const tabs: TabItem[] = [
    { id: 'overview', label: 'Overview', icon: <FolderOpen className="w-4 h-4" /> },
    {
      id: 'tasks',
      label: 'Tasks',
      icon: <CheckCircle2 className="w-4 h-4" />,
      count: tasksData?.total || stats?.total_tasks || 0,
    },
    {
      id: 'team',
      label: 'Team Members',
      icon: <Users className="w-4 h-4" />,
      count: members.length,
    },
    {
      id: 'git',
      label: 'Git Repositories',
      icon: <GitBranch className="w-4 h-4" />,
      count: repos.length,
    },
    {
      id: 'files',
      label: 'Files & Vault',
      icon: <FileText className="w-4 h-4" />,
      count: attachments.length,
    },
  ];

  const totalTasks = stats?.total_tasks || project.task_count || 0;
  const doneTasks = stats?.completed_tasks || project.completed_task_count || 0;
  const progressPercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header Banner */}
      <div className="bg-white p-6 border border-border rounded-lg shadow-subtle flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1 max-w-2xl">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-text-primary tracking-tight">
                {project.name}
              </h1>
              <Badge variant="project" value={project.status} size="md" />
              <Badge variant="priority" value={project.priority} size="md" />
            </div>
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">
              {project.description || 'No project description provided.'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isManagerOrAdmin && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<BellRing className="w-3.5 h-3.5 text-amber-600" />}
                isLoading={sendStaleRemindersMutation.isPending}
                onClick={() => sendStaleRemindersMutation.mutate()}
                title="Send daily email reminders to engineers for pending tasks with PM in CC"
              >
                Send Pending Reminders
              </Button>
            )}
            <Link to={`/projects/${project.id}/board`}>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Kanban className="w-3.5 h-3.5 text-copper-600" />}
              >
                Kanban Board
              </Button>
            </Link>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setIsTaskModalOpen(true)}
            >
              Add Task
            </Button>
          </div>
        </div>


        {/* Schedule & Progress Bar */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-6 text-text-secondary">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-text-muted" />
              <span>Start: {formatDate(project.start_date)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-text-muted" />
              <span>Target: {formatDate(project.target_date)}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 min-w-[200px]">
            <span className="font-mono text-xs font-semibold text-text-primary">
              {progressPercent}%
            </span>
            <div className="w-32">
              <ProgressBar value={progressPercent} size="sm" showPercentage={false} />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-5">
            {/* Engineering Objectives */}
            <div className="bg-white p-5 rounded-lg border border-border shadow-subtle flex flex-col gap-3">
              <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                Engineering Objectives &amp; Milestones
              </h3>
              <div className="text-xs text-text-primary leading-relaxed bg-slate-50 p-4 rounded border border-border whitespace-pre-wrap">
                {project.objectives || 'No detailed objectives specified.'}
              </div>
            </div>

            {/* Linked Gitea Repos */}
            <div className="bg-white p-5 rounded-lg border border-border shadow-subtle flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <GitBranch className="w-4 h-4 text-copper-600" />
                  Linked Repositories
                </h3>
              </div>
              {repos.length === 0 ? (
                <p className="text-xs text-text-muted italic">
                  No Git repositories connected yet. Go to the "Git Repositories" tab to connect your Gitea repos.
                </p>
              ) : (
                <div className="divide-y divide-border border border-border rounded-md overflow-hidden text-xs">
                  {repos.map((r) => (
                    <div key={r.id} className="p-3 flex items-center justify-between bg-white hover:bg-slate-50">
                      <div>
                        <span className="font-mono font-bold text-text-primary">
                          {r.repo_full_name}
                        </span>
                        <span className="text-[11px] text-text-muted block mt-0.5">
                          Default branch: <span className="font-mono">{r.default_branch}</span>
                        </span>
                      </div>
                      <a
                        href={r.repo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-text-muted hover:text-copper-700 p-1"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right side metric cards */}
          <div className="flex flex-col gap-4">
            <div className="bg-white p-5 rounded-lg border border-border shadow-subtle flex flex-col gap-3">
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Task Breakdown
              </h4>
              <div className="flex flex-col gap-2 font-mono text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">To Do</span>
                  <span className="font-bold">{stats?.tasks_by_status?.TODO || 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-blue-600">In Progress</span>
                  <span className="font-bold">{stats?.tasks_by_status?.IN_PROGRESS || 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-violet-600">In Review</span>
                  <span className="font-bold">{stats?.tasks_by_status?.IN_REVIEW || 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-red-600">Blocked</span>
                  <span className="font-bold">{stats?.tasks_by_status?.BLOCKED || 0}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-green-600">Done</span>
                  <span className="font-bold">{stats?.tasks_by_status?.DONE || 0}</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-lg border border-border shadow-subtle flex flex-col gap-2">
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Hours Invested
              </h4>
              <span className="font-mono text-2xl font-bold text-copper-700">
                {stats?.total_hours || 0}h
              </span>
              <p className="text-[11px] text-text-muted">Total logged across all hardware tasks</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Tasks List */}
      {activeTab === 'tasks' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <TaskFilters
              filters={taskFilters}
              onChange={setTaskFilters}
              users={allUsersData?.items || []}
              className="flex-1"
            />
          </div>

          <div className="bg-white border border-border rounded-lg overflow-hidden shadow-subtle">
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
                  {isLoadingTasks ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center">
                        <Spinner size="md" />
                      </td>
                    </tr>
                  ) : !tasksData?.items || tasksData.items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-text-muted italic">
                        No tasks match the filter criteria.
                      </td>
                    </tr>
                  ) : (
                    tasksData.items.map((task) => (
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
        </div>
      )}

      {/* Tab 3: Team Members */}
      {activeTab === 'team' && (
        <div className="bg-white p-5 rounded-lg border border-border shadow-subtle flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <h3 className="text-sm font-bold text-text-primary">Project Team Members</h3>
            {isManagerOrAdmin && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => setIsMemberModalOpen(true)}
              >
                Assign Member
              </Button>
            )}
          </div>

          {isLoadingMembers ? (
            <div className="py-12 text-center">
              <Spinner size="md" />
            </div>
          ) : members.length === 0 ? (
            <EmptyState
              heading="No Team Members"
              description="Assign engineers, schematic reviewers, or technicians to this project."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {members.map((m) => (
                <div
                  key={m.id || m.user_id}
                  className="p-3.5 rounded-lg border border-border bg-slate-50/50 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={m.user?.full_name || 'Engineer'} size="md" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold text-text-primary truncate">
                        {m.user?.full_name}
                      </span>
                      <span className="text-[11px] text-text-muted truncate">{m.user?.email}</span>
                      <div className="mt-1">
                        <Badge variant="role" value={m.role} size="sm" />
                      </div>
                    </div>
                  </div>

                  {isManagerOrAdmin && (
                    <button
                      onClick={() => removeMemberMutation.mutate(m.user_id)}
                      className="text-text-muted hover:text-red-600 p-1 rounded"
                      title="Remove from project"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Git Activity */}
      {activeTab === 'git' && (
        <div className="flex flex-col gap-5">
          {isManagerOrAdmin && (
            <RepoLinker
              onLink={async (fullName, url) => {
                await linkRepoMutation.mutateAsync({ fullName, url });
              }}
              isLoading={linkRepoMutation.isPending}
            />
          )}

          {isLoadingRepos ? (
            <div className="py-12 text-center">
              <Spinner size="md" />
            </div>
          ) : repos.length === 0 ? (
            <EmptyState
              heading="No Repositories Linked"
              description="Connect your Gitea hardware schematics, PCB layout, or firmware repo above."
            />
          ) : (
            <div className="flex flex-col gap-5">
              {repos.map((r) => (
                <ProjectRepoCard
                  key={r.id}
                  repo={r}
                  isManagerOrAdmin={isManagerOrAdmin}
                  onUnlink={(rId) => unlinkRepoMutation.mutate(rId)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Files / Attachments */}
      {activeTab === 'files' && (
        <div className="bg-white p-5 rounded-lg border border-border shadow-subtle flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
            <div>
              <h3 className="text-sm font-bold text-text-primary">
                Project Files, Hardware Schematics &amp; Firmware Vault
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Centralized file repository for PCB layout files, Gerber zips, hex/bin files, datasheets, and BOMs.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Upload className="w-3.5 h-3.5" />}
              onClick={() => setIsUploadModalOpen(true)}
            >
              Upload Project File
            </Button>
          </div>

          {/* Search & Category Filter */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: 'ALL', label: 'All Files' },
                { id: 'SCHEMATICS', label: 'Schematics (.sch/.kicad)' },
                { id: 'GERBER', label: 'PCB & Gerbers (.zip)' },
                { id: 'FIRMWARE', label: 'Firmware (.bin/.hex)' },
                { id: 'BOM', label: 'BOM & Parts (.csv/.xlsx)' },
                { id: 'DOCS', label: 'Datasheets & Docs (.pdf)' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setFileFilterCategory(cat.id)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    fileFilterCategory === cat.id
                      ? 'bg-copper-100 text-copper-800 border-copper-300 font-semibold'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="w-48">
              <Input
                placeholder="Search filenames..."
                value={fileSearch}
                onChange={(e) => setFileSearch(e.target.value)}
              />
            </div>
          </div>

          {isLoadingAttachments ? (
            <div className="py-12 text-center">
              <Spinner size="md" />
            </div>
          ) : (() => {
            const filtered = attachments.filter((att) => {
              if (fileSearch && !att.filename.toLowerCase().includes(fileSearch.toLowerCase())) {
                return false;
              }
              const ext = att.filename.split('.').pop()?.toLowerCase() || '';
              if (fileFilterCategory === 'SCHEMATICS') {
                return ['sch', 'kicad_sch', 'brd', 'kicad_pcb'].includes(ext);
              }
              if (fileFilterCategory === 'GERBER') {
                return ['zip', 'tar', 'gz', 'gbr', 'gerber'].includes(ext);
              }
              if (fileFilterCategory === 'FIRMWARE') {
                return ['bin', 'hex', 'elf', 'c', 'h', 'cpp', 'ino'].includes(ext);
              }
              if (fileFilterCategory === 'BOM') {
                return ['csv', 'xlsx', 'xls', 'tsv'].includes(ext);
              }
              if (fileFilterCategory === 'DOCS') {
                return ['pdf', 'doc', 'docx', 'md', 'txt'].includes(ext);
              }
              return true;
            });

            if (filtered.length === 0) {
              return (
                <EmptyState
                  heading="No Files Found"
                  description={
                    fileSearch || fileFilterCategory !== 'ALL'
                      ? 'No files match your current category filter or search term.'
                      : 'Click "Upload Project File" above to add hardware schematics, PCB Gerbers, firmware, or datasheets.'
                  }
                />
              );
            }

            return (
              <div className="divide-y divide-border border border-border rounded overflow-hidden text-xs">
                {filtered.map((att) => (
                  <div key={att.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-copper-50 text-copper-700 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-text-primary">{att.filename}</p>
                        <p className="text-[10px] text-text-muted">
                          {formatFileSize(att.file_size)} &bull; Uploaded {formatDate(att.created_at)}
                          {att.user && ` by ${att.user.full_name || att.user.username}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<Download className="w-3.5 h-3.5" />}
                        onClick={() => api.attachments.downloadAttachment(att.id, att.filename)}
                      >
                        Download
                      </Button>
                      {isManagerOrAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (window.confirm(`Delete ${att.filename}?`)) {
                              deleteFileMutation.mutate(att.id);
                            }
                          }}
                          className="text-text-muted hover:text-red-600"
                          title="Delete file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}


      {/* Task Creation Modal */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSubmit={async (data) => {
          await createTaskMutation.mutateAsync(data);
        }}
        projects={[project]}
        users={allUsersData?.items || []}
        defaultProjectId={project.id}
      />

      {/* Add Member Modal */}
      <Modal
        isOpen={isMemberModalOpen}
        onClose={() => setIsMemberModalOpen(false)}
        title="Assign Team Member to Project"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setIsMemberModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!selectedUserId}
              isLoading={addMemberMutation.isPending}
              onClick={() => addMemberMutation.mutate()}
            >
              Assign
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select
            label="User"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            required
          >
            <option value="">Select an engineer or manager</option>
            {allUsersData?.items?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.email})
              </option>
            ))}
          </Select>

          <Select
            label="Project Role"
            value={memberRole}
            onChange={(e) => setMemberRole(e.target.value)}
          >
            <option value="ENGINEER">Engineer</option>
            <option value="PROJECT_MANAGER">Project Manager</option>
            <option value="REVIEWER">Reviewer</option>
          </Select>
        </div>
      </Modal>

      {/* Upload Project Document Modal */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => {
          setIsUploadModalOpen(false);
          setFileToUpload(null);
        }}
        title="Upload Project File & Schematics"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsUploadModalOpen(false);
                setFileToUpload(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!fileToUpload}
              isLoading={uploadFileMutation.isPending}
              onClick={() => {
                if (fileToUpload) {
                  uploadFileMutation.mutate(fileToUpload);
                }
              }}
            >
              Upload Document
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="p-6 border-2 border-dashed border-slate-300 rounded-lg text-center hover:border-copper-500 transition-colors bg-slate-50">
            <input
              type="file"
              id="file-upload-input"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setFileToUpload(e.target.files[0]);
                }
              }}
            />
            <label htmlFor="file-upload-input" className="cursor-pointer flex flex-col items-center gap-2">
              <Upload className="w-8 h-8 text-copper-600" />
              <span className="text-xs font-semibold text-text-primary">
                {fileToUpload ? fileToUpload.name : 'Click to select project file'}
              </span>
              <span className="text-[11px] text-text-muted">
                {fileToUpload
                  ? `${formatFileSize(fileToUpload.size)} selected`
                  : 'Schematics (.kicad_sch), PCB Gerbers (.zip), Firmware (.bin/.hex), BOMs (.csv), Datasheets (.pdf) up to 25MB'}
              </span>
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
};

