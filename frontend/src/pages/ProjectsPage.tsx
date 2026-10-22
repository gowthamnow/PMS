import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Project, ProjectStatus, Priority } from '../types';
import { Table, Column } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Textarea } from '../components/ui/Textarea';
import { Select } from '../components/ui/Select';
import { DatePicker } from '../components/ui/DatePicker';
import { ProgressBar } from '../components/ui/ProgressBar';
import { EmptyState } from '../components/ui/EmptyState';
import { formatDate } from '../lib/utils';
import { Plus, Search, FolderPlus, X, LayoutGrid, List, Trash2, AlertTriangle } from 'lucide-react';
import { ProjectCard3D } from '../components/projects/ProjectCard3D';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';

const projectSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  objectives: z.string().optional(),
  status: z.enum(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  start_date: z.string().optional(),
  target_date: z.string().optional(),
  workspace_id: z.string().optional(),
});

type ProjectFormData = z.infer<typeof projectSchema>;

export const ProjectsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [workspaceFilter, setWorkspaceFilter] = useState<string>('');
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const isAdmin = user?.role === 'ADMIN';

  // Fetch workspaces (for admin workspace switching & assignment)
  const { data: workspaces = [] } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api.workspaces.getWorkspaces(),
  });

  // Fetch projects query
  const { data, isLoading } = useQuery({
    queryKey: ['projects', { page, status: statusFilter, search, workspaceFilter }],
    queryFn: () =>
      api.projects.getProjects({
        page,
        page_size: 12,
        status: statusFilter || undefined,
        search: search || undefined,
        workspace_id: workspaceFilter || undefined,
      }),
  });

  // Create project form
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: '',
      description: '',
      objectives: '',
      status: 'PLANNING',
      priority: 'MEDIUM',
      start_date: '',
      target_date: '',
    },
  });

  const createMutation = useMutation({
    mutationFn: (newProject: ProjectFormData) => api.projects.createProject(newProject),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setIsCreateModalOpen(false);
      reset();
      toast.success('Project created successfully');
      navigate(`/projects/${created.id}`);
    },
    onError: () => toast.error('Failed to create project'),
  });

  const handleCreateSubmit = async (formData: ProjectFormData) => {
    await createMutation.mutateAsync(formData);
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.projects.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setProjectToDelete(null);
      toast.success('Project deleted successfully');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to delete project');
    },
  });

  const columns: Column<Project>[] = [
    {
      key: 'name',
      header: 'Project Name',
      render: (p) => (
        <div className="flex flex-col">
          <span className="font-semibold text-text-primary text-xs hover:text-copper-700">
            {p.name}
          </span>
          <span className="text-[11px] text-text-muted truncate max-w-xs">
            {p.description || 'No description'}
          </span>
        </div>
      ),
    },
    {
      key: 'workspace',
      header: 'Workspace',
      render: (p) => (
        <span className="text-xs text-text-secondary">
          {p.workspace_name ? `🏢 ${p.workspace_name}` : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <Badge variant="project" value={p.status} size="sm" />,
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (p) => <Badge variant="priority" value={p.priority} size="sm" />,
    },
    {
      key: 'progress',
      header: 'Task Progress',
      render: (p) => {
        const total = p.task_count || 0;
        const done = p.completed_task_count || 0;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        return (
          <div className="w-32 flex flex-col gap-1">
            <ProgressBar value={pct} size="sm" showPercentage={false} />
            <span className="text-[10px] text-text-muted font-mono">
              {done}/{total} done ({pct}%)
            </span>
          </div>
        );
      },
    },
    {
      key: 'members',
      header: 'Team',
      render: (p) => (
        <span className="font-mono text-xs text-text-secondary">
          {p.member_count || 1} members
        </span>
      ),
    },
    {
      key: 'dates',
      header: 'Target Date',
      render: (p) => (
        <span className="text-xs text-text-secondary">
          {p.target_date ? formatDate(p.target_date, 'MMM d, yyyy') : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (p) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setProjectToDelete(p)}
              className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Delete Project"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-border">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Engineering Projects</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Manage hardware, firmware, PCB schematics, and software engineering initiatives.
          </p>
        </div>
        {isAdmin && (
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsCreateModalOpen(true)}
          >
            Create Project
          </Button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 border border-border rounded-lg shadow-subtle">
        <div className="flex items-center gap-3 flex-1 min-w-[220px]">
          <div className="relative w-full max-w-sm">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter projects by title..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-border rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-copper-500 focus:bg-white"
            />
          </div>

          <div className="w-40">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs bg-white border border-border rounded-md px-2.5 py-1.5 text-text-secondary focus:outline-none focus:ring-1 focus:ring-copper-500 cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="PLANNING">Planning</option>
              <option value="ACTIVE">Active</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="COMPLETED">Completed</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>

          {isAdmin && workspaces.length > 0 && (
            <div className="w-48">
              <select
                value={workspaceFilter}
                onChange={(e) => {
                  setWorkspaceFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full text-xs bg-white border border-border rounded-md px-2.5 py-1.5 text-text-secondary focus:outline-none focus:ring-1 focus:ring-copper-500 cursor-pointer"
              >
                <option value="">All Workspaces</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    🏢 {ws.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!isAdmin && user?.workspace_name && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-xs border border-slate-200">
              <span className="text-slate-400">Workspace:</span>
              <strong className="text-slate-900 font-semibold">{user.workspace_name}</strong>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {(search || statusFilter || workspaceFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setStatusFilter('');
                setWorkspaceFilter('');
              }}
              className="text-text-muted hover:text-red-600 gap-1 text-xs"
            >
              <X className="w-3.5 h-3.5" />
              Reset
            </Button>
          )}

          {/* Grid vs Table View Mode Switcher */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'grid'
                  ? 'bg-white shadow-xs text-copper-700'
                  : 'text-text-muted hover:text-text-primary'
              }`}
              title="Cards Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'table'
                  ? 'bg-white shadow-xs text-copper-700'
                  : 'text-text-muted hover:text-text-primary'
              }`}
              title="Table List View"
            >
              <List className="w-4 h-4" />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>
        </div>
      </div>

      {/* Projects Display: Grid vs Table */}
      {viewMode === 'grid' ? (
        isLoading ? (
          <div className="py-16 flex justify-center items-center">
            <FolderPlus className="w-8 h-8 text-copper-500 animate-pulse" />
          </div>
        ) : (data?.items || []).length === 0 ? (
          <EmptyState
            heading="No engineering projects found"
            description="No projects match your current filters. Check back or reset search."
            icon={<FolderPlus className="w-10 h-10 text-slate-300" />}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {(data?.items || []).map((project) => (
              <ProjectCard3D
                key={project.id}
                project={project}
                onDelete={isAdmin ? (p) => setProjectToDelete(p) : undefined}
              />
            ))}
          </div>
        )
      ) : (
        <Table
          columns={columns}
          data={data?.items || []}
          isLoading={isLoading}
          emptyMessage="No engineering projects match the selected criteria."
          emptyIcon={<FolderPlus className="w-8 h-8 text-slate-300" />}
          page={data?.page || 1}
          totalPages={data?.pages || 1}
          totalCount={data?.total || 0}
          onPageChange={(newPage) => setPage(newPage)}
          onRowClick={(p) => navigate(`/projects/${p.id}`)}
        />
      )}

      {/* Create Project Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Initialize New Engineering Project"
        description="Establish timeline, scope, objectives, and assign lead hardware/firmware engineers."
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsCreateModalOpen(false)}
              type="button"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
              onClick={handleSubmit(handleCreateSubmit)}
              type="button"
            >
              Initialize Project
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(handleCreateSubmit)} className="flex flex-col gap-4">
          <Input
            label="Project Name"
            placeholder="e.g. BMS Battery Management Subsystem v2"
            required
            error={errors.name?.message}
            {...register('name')}
          />

          {isAdmin && workspaces.length > 0 && (
            <Select label="Assign Workspace" {...register('workspace_id')}>
              <option value="">Default Workspace</option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </Select>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Select label="Status" error={errors.status?.message} {...register('status')}>
              <option value="PLANNING">Planning</option>
              <option value="ACTIVE">Active</option>
              <option value="ON_HOLD">On Hold</option>
            </Select>

            <Select label="Priority" error={errors.priority?.message} {...register('priority')}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DatePicker
              label="Start Date"
              error={errors.start_date?.message}
              {...register('start_date')}
            />
            <DatePicker
              label="Target Date"
              error={errors.target_date?.message}
              {...register('target_date')}
            />
          </div>

          <Textarea
            label="Engineering Description"
            placeholder="High-level hardware/firmware architecture overview..."
            error={errors.description?.message}
            {...register('description')}
          />

          <Textarea
            label="Key Deliverables / Objectives"
            placeholder="Schematic freeze date, gerbers release, prototype bring-up..."
            error={errors.objectives?.message}
            {...register('objectives')}
          />
        </form>
      </Modal>

      {/* Delete Project Confirmation Modal */}
      {isAdmin && (
        <Modal
          isOpen={!!projectToDelete}
          onClose={() => setProjectToDelete(null)}
          title="Delete Project"
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertTriangle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900">Are you sure you want to permanently delete this project?</p>
                <p className="mt-1 leading-relaxed">
                  This action will permanently delete <strong>{projectToDelete?.name}</strong> along with all associated tasks, deliverables, time entries, and uploaded files. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setProjectToDelete(null)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                isLoading={deleteMutation.isPending}
                onClick={() => projectToDelete && deleteMutation.mutate(projectToDelete.id)}
              >
                Permanently Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
