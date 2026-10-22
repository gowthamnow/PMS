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
import { Plus, Search, FolderPlus, X, LayoutGrid, List } from 'lucide-react';
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
});

type ProjectFormData = z.infer<typeof projectSchema>;

export const ProjectsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const isAdmin = user?.role === 'ADMIN';

  // Fetch projects query
  const { data, isLoading } = useQuery({
    queryKey: ['projects', { page, status: statusFilter, search }],
    queryFn: () =>
      api.projects.getProjects({
        page,
        page_size: 10,
        status: statusFilter || undefined,
        search: search || undefined,
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
          {p.member_count || 0} members
        </span>
      ),
    },
    {
      key: 'dates',
      header: 'Target Date',
      render: (p) => (
        <span className="text-xs text-text-secondary">
          {formatDate(p.target_date, 'MMM d, yyyy')}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Engineering Projects</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Manage PCB, firmware, and embedded system initiatives.
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
        </div>

        <div className="flex items-center gap-2">
          {(search || statusFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setStatusFilter('');
              }}
              className="text-text-muted hover:text-red-600 gap-1"
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
              title="3D Square Cards Grid"
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden sm:inline">3D Grid</span>
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

      {/* Projects Display: 3D Grid vs Table */}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {(data?.items || []).map((project) => (
              <ProjectCard3D key={project.id} project={project} />
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
    </div>
  );
};
