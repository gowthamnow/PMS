import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';
import { User, UserRole, Workspace } from '../../types';
import { Table, Column } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Select } from '../../components/ui/Select';
import { Avatar } from '../../components/ui/Avatar';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatDate } from '../../lib/utils';
import {
  UserPlus,
  Edit2,
  KeyRound,
  UserX,
  UserCheck,
  Search,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Building,
  Users,
  FolderOpen,
  Plus,
  Trash2,
  AlertTriangle,
  UserMinus,
  Check,
  ArrowRightLeft,
  Layers,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';

const userSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  role: z.enum(['ADMIN', 'PROJECT_MANAGER', 'ENGINEER']),
  password: z.string().optional(),
  workspace_id: z.string().optional(),
});

type UserFormData = z.infer<typeof userSchema>;

const workspaceSchema = z.object({
  name: z.string().min(2, 'Workspace name must be at least 2 characters'),
  description: z.string().optional(),
});

type WorkspaceFormData = z.infer<typeof workspaceSchema>;

export const UsersPage: React.FC = () => {
  const { user: currentUser, switchWorkspace } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'workspaces' ? 'workspaces' : 'users';

  const setActiveTab = (tab: 'users' | 'workspaces') => {
    setSearchParams({ tab });
  };

  // User States
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [toggleConfirmUser, setToggleConfirmUser] = useState<User | null>(null);
  const [resetConfirmUser, setResetConfirmUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // Workspace States
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(null);
  const [managingMembersWorkspace, setManagingMembersWorkspace] = useState<Workspace | null>(null);
  const [selectedUserToAssign, setSelectedUserToAssign] = useState<string>('');
  const [autoSwitchToCreated, setAutoSwitchToCreated] = useState(true);
  const [isSwitchingWorkspace, setIsSwitchingWorkspace] = useState(false);

  const handleSwitchWorkspace = async (wsId: string | null, wsName: string) => {
    if (isSwitchingWorkspace) return;
    setIsSwitchingWorkspace(true);
    try {
      await switchWorkspace(wsId);
      await queryClient.invalidateQueries();
      toast.success(`Active Workspace: ${wsName}`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to switch workspace');
    } finally {
      setIsSwitchingWorkspace(false);
    }
  };

  // 1. Fetch Users
  const { data, isLoading } = useQuery({
    queryKey: ['users', { page, search }],
    queryFn: () => api.users.getUsers(page, 20, search || undefined),
  });

  // 2. Fetch all users for member assignment select
  const { data: allUsersData } = useQuery({
    queryKey: ['all-users-lookup'],
    queryFn: () => api.users.getUsers(1, 100),
  });
  const allUsers = allUsersData?.items || [];

  // 3. Fetch Workspaces
  const { data: workspaces = [], isLoading: isLoadingWorkspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api.workspaces.getWorkspaces(),
  });

  // 4. Fetch Members of currently selected workspace for management modal
  const { data: currentWsMembers = [], isLoading: isLoadingWsMembers } = useQuery({
    queryKey: ['workspace-members', managingMembersWorkspace?.id],
    queryFn: () => api.workspaces.getWorkspaceMembers(managingMembersWorkspace!.id),
    enabled: !!managingMembersWorkspace,
  });

  const pendingUsers = (data?.items || []).filter((u) => !u.is_active);

  // User form
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      full_name: '',
      username: '',
      email: '',
      role: 'ENGINEER',
      password: '',
      workspace_id: '',
    },
  });

  // Workspace form
  const {
    register: registerWorkspace,
    handleSubmit: handleSubmitWorkspace,
    reset: resetWorkspace,
    formState: { errors: workspaceErrors, isSubmitting: isSubmittingWorkspace },
  } = useForm<WorkspaceFormData>({
    resolver: zodResolver(workspaceSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  const openCreateModal = () => {
    setEditingUser(null);
    reset({
      full_name: '',
      username: '',
      email: '',
      role: 'ENGINEER',
      password: '',
      workspace_id: workspaces[0]?.id || '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (u: User) => {
    setEditingUser(u);
    reset({
      full_name: u.full_name,
      username: u.username,
      email: u.email,
      role: u.role,
      password: '',
      workspace_id: u.workspace_id || '',
    });
    setIsModalOpen(true);
  };

  const openCreateWorkspaceModal = () => {
    setEditingWorkspace(null);
    resetWorkspace({
      name: '',
      description: '',
    });
    setIsWorkspaceModalOpen(true);
  };

  const openEditWorkspaceModal = (ws: Workspace) => {
    setEditingWorkspace(ws);
    resetWorkspace({
      name: ws.name,
      description: ws.description || '',
    });
    setIsWorkspaceModalOpen(true);
  };

  // Create User Mutation
  const createMutation = useMutation({
    mutationFn: (userData: UserFormData) => {
      const payload: any = { ...userData };
      if (!payload.workspace_id) delete payload.workspace_id;
      return api.users.createUser(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      setIsModalOpen(false);
      toast.success('User account created successfully');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to create user');
    },
  });

  // Update User Mutation
  const updateMutation = useMutation({
    mutationFn: (userData: UserFormData) => {
      const payload: any = { ...userData };
      if (!payload.password) delete payload.password;
      payload.workspace_id = payload.workspace_id || null;
      return api.users.updateUser(editingUser!.id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      setIsModalOpen(false);
      toast.success('User account updated');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to update user');
    },
  });

  // Approve User Mutation
  const approveMutation = useMutation({
    mutationFn: (userId: string) => api.users.approveUser(userId),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(res.message || 'User approved and activated successfully!');
    },
    onError: () => toast.error('Failed to approve user'),
  });

  // Activate / Deactivate Mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async (u: User) => {
      if (u.is_active) {
        await api.users.deactivateUser(u.id);
      } else {
        await api.users.activateUser(u.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setToggleConfirmUser(null);
      toast.success('User status updated');
    },
    onError: () => toast.error('Failed to change user status'),
  });

  // Reset Password Mutation
  const resetPasswordMutation = useMutation({
    mutationFn: (u: User) => api.users.resetPassword(u.id),
    onSuccess: (res: any) => {
      setResetConfirmUser(null);
      toast.success(res.message || 'Password reset instruction sent');
    },
    onError: () => toast.error('Failed to reset password'),
  });

  // Delete User Mutation
  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => api.users.deleteUser(userId),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['all-users-lookup'] });
      setUserToDelete(null);
      toast.success(res?.message || 'User deleted successfully');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to delete user');
    },
  });

  // Create Workspace Mutation
  const createWorkspaceMutation = useMutation({
    mutationFn: (data: WorkspaceFormData) => api.workspaces.createWorkspace(data),
    onSuccess: async (createdWs) => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      setIsWorkspaceModalOpen(false);
      if (autoSwitchToCreated && createdWs?.id) {
        try {
          await switchWorkspace(createdWs.id);
          await queryClient.invalidateQueries();
          toast.success(`Created & switched into workspace: ${createdWs.name}`);
        } catch {
          toast.success('Workspace created successfully');
        }
      } else {
        toast.success('Workspace created successfully');
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to create workspace');
    },
  });

  // Update Workspace Mutation
  const updateWorkspaceMutation = useMutation({
    mutationFn: (data: WorkspaceFormData) =>
      api.workspaces.updateWorkspace(editingWorkspace!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsWorkspaceModalOpen(false);
      toast.success('Workspace updated successfully');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to update workspace');
    },
  });

  // Delete Workspace Mutation
  const deleteWorkspaceMutation = useMutation({
    mutationFn: (id: string) => api.workspaces.deleteWorkspace(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setWorkspaceToDelete(null);
      toast.success('Workspace deleted successfully');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to delete workspace');
    },
  });

  // Assign Member to Workspace Mutation
  const assignMemberMutation = useMutation({
    mutationFn: ({ wsId, userId }: { wsId: string; userId: string }) =>
      api.workspaces.assignMember(wsId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setSelectedUserToAssign('');
      toast.success('Member assigned to workspace');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to assign member');
    },
  });

  // Remove Member from Workspace Mutation
  const removeMemberMutation = useMutation({
    mutationFn: ({ wsId, userId }: { wsId: string; userId: string }) =>
      api.workspaces.removeMember(wsId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Member removed from workspace');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to remove member');
    },
  });

  const onUserFormSubmit = async (formData: UserFormData) => {
    if (editingUser) {
      await updateMutation.mutateAsync(formData);
    } else {
      await createMutation.mutateAsync(formData);
    }
  };

  const onWorkspaceFormSubmit = async (formData: WorkspaceFormData) => {
    if (editingWorkspace) {
      await updateWorkspaceMutation.mutateAsync(formData);
    } else {
      await createWorkspaceMutation.mutateAsync(formData);
    }
  };

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Full Name',
      render: (u) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={u.full_name} src={u.avatar_url} size="sm" />
          <div className="flex flex-col">
            <span className="font-semibold text-text-primary text-xs">{u.full_name}</span>
            <span className="font-mono text-[10px] text-text-muted">@{u.username}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (u) => <span className="text-text-secondary text-xs">{u.email}</span>,
    },
    {
      key: 'role',
      header: 'Role',
      render: (u) => <Badge variant="role" value={u.role} size="sm" />,
    },
    {
      key: 'workspace',
      header: 'Assigned Workspace',
      render: (u) => (
        <span className="text-xs text-text-secondary inline-flex items-center gap-1 font-medium">
          {u.workspace_name ? (
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
              🏢 {u.workspace_name}
            </span>
          ) : (
            <span className="text-slate-400 italic">Unassigned</span>
          )}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => (
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border ${
            u.is_active
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-amber-50 text-amber-800 border-amber-300'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-green-600' : 'bg-amber-500'}`}
          />
          {u.is_active ? 'Active' : 'Pending Approval'}
        </span>
      ),
    },
    {
      key: 'last_login',
      header: 'Last Login',
      render: (u) => (
        <span className="text-text-muted text-xs">
          {u.last_login ? formatDate(u.last_login, 'MMM d, yyyy HH:mm') : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (u) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {!u.is_active && (
            <button
              onClick={() => approveMutation.mutate(u.id)}
              disabled={approveMutation.isPending}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-semibold inline-flex items-center gap-1 shadow-xs transition-colors"
              title="Approve and activate this user"
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>Approve Access</span>
            </button>
          )}

          <button
            onClick={() => openEditModal(u)}
            className="p-1 text-text-muted hover:text-copper-700 hover:bg-slate-100 rounded"
            title="Edit details"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setResetConfirmUser(u)}
            className="p-1 text-text-muted hover:text-amber-700 hover:bg-slate-100 rounded"
            title="Reset Password"
          >
            <KeyRound className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setToggleConfirmUser(u)}
            className={`p-1 rounded ${
              u.is_active
                ? 'text-text-muted hover:text-red-700 hover:bg-red-50'
                : 'text-text-muted hover:text-green-700 hover:bg-green-50'
            }`}
            title={u.is_active ? 'Deactivate Account' : 'Activate Account'}
          >
            {u.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
          </button>
          {u.id !== currentUser?.id && u.email !== 'gowthamthangaraj18@gmail.com' && (
            <button
              onClick={() => setUserToDelete(u)}
              className="p-1 text-text-muted hover:text-red-700 hover:bg-red-50 rounded transition-colors"
              title="Permanently Delete User"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-border">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Organization Administration</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Manage multi-workspace isolation, engineer permissions, and organization security credentials.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'users' ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<UserPlus className="w-4 h-4" />}
              onClick={openCreateModal}
            >
              Add User
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={openCreateWorkspaceModal}
            >
              Create Workspace
            </Button>
          )}
        </div>
      </div>

      {/* Tabs Switcher: Users vs Workspaces */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-2 border-b-2 -mb-[1px] ${
            activeTab === 'users'
              ? 'border-copper-600 text-copper-700 bg-white shadow-2xs'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Accounts ({data?.total || 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('workspaces')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-2 border-b-2 -mb-[1px] ${
            activeTab === 'workspaces'
              ? 'border-copper-600 text-copper-700 bg-white shadow-2xs'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>Workspaces & Access Isolation ({workspaces.length})</span>
        </button>
      </div>

      {/* TAB 1: USERS MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="flex flex-col gap-5">
          {/* Pending Approval Alert Banner */}
          {pendingUsers.length > 0 && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between gap-3 shadow-subtle">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-xs font-medium text-amber-900">
                  <strong>{pendingUsers.length}</strong> new user accounts are awaiting administrator approval to access engineering workspaces.
                </span>
              </div>
              <span className="text-[11px] font-mono text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded">
                Click &quot;Approve Access&quot; below
              </span>
            </div>
          )}

          {/* Search Filter */}
          <div className="flex items-center justify-between gap-4 bg-white p-3 border border-border rounded-lg shadow-subtle">
            <div className="relative w-full max-w-sm">
              <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search users by name, username or email..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-border rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-copper-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Users Table */}
          <Table
            columns={columns}
            data={data?.items || []}
            isLoading={isLoading}
            emptyMessage="No users match your search query."
            page={data?.page || 1}
            totalPages={data?.pages || 1}
            totalCount={data?.total || 0}
            onPageChange={(newPage) => setPage(newPage)}
          />
        </div>
      )}

      {/* TAB 2: WORKSPACES MANAGEMENT */}
      {activeTab === 'workspaces' && (
        <div className="flex flex-col gap-5">
          {/* Active Workspace Banner */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-copper-50 border border-copper-100 flex items-center justify-center text-lg shrink-0">
                🏢
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">Current Active Workspace:</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-copper-100 text-copper-800 border border-copper-200">
                    {currentUser?.workspace_name || 'All Workspaces (Admin Overview)'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {currentUser?.workspace_id
                    ? 'Currently scoped to this workspace. Dashboard metrics, project lists, and task views reflect this active workspace.'
                    : 'Viewing consolidated company-wide engineering data across all workspaces.'}
                </p>
              </div>
            </div>

            {currentUser?.workspace_id && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleSwitchWorkspace(null, 'All Workspaces (Global)')}
                disabled={isSwitchingWorkspace}
                className="text-xs h-8 shrink-0 hover:bg-slate-100"
              >
                <Layers className="w-3.5 h-3.5 mr-1.5" />
                Switch to All Workspaces
              </Button>
            )}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-600 flex flex-col gap-1">
            <span className="font-semibold text-slate-900 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-copper-600" />
              Workspace Access Control Policy
            </span>
            <p className="leading-relaxed">
              Administrators can seamlessly switch between workspaces or view company-wide data. Regular engineers and project managers are strictly confined to their single assigned workspace and projects.
            </p>
          </div>

          {isLoadingWorkspaces ? (
            <div className="py-12 flex justify-center items-center">
              <Building className="w-8 h-8 text-copper-500 animate-pulse" />
            </div>
          ) : workspaces.length === 0 ? (
            <EmptyState
              heading="No workspaces configured"
              description="Create a workspace to begin organizing engineering initiatives and assigning team members."
              icon={<Building className="w-10 h-10 text-slate-300" />}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {workspaces.map((ws) => {
                const isActiveWorkspace = currentUser?.workspace_id === ws.id;
                return (
                  <div
                    key={ws.id}
                    className={`bg-white border rounded-xl p-5 shadow-xs flex flex-col justify-between gap-4 transition-all ${
                      isActiveWorkspace
                        ? 'border-copper-500 ring-2 ring-copper-500/20 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={`p-2 rounded-lg font-bold text-sm border ${
                            isActiveWorkspace
                              ? 'bg-copper-600 text-white border-copper-700'
                              : 'bg-copper-50 text-copper-700 border-copper-100'
                          }`}>
                            🏢
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-slate-900 leading-tight">
                                {ws.name}
                              </h3>
                              {isActiveWorkspace && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold inline-flex items-center gap-1">
                                  <Check className="w-3 h-3 text-emerald-600" /> Active
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Created {formatDate(ws.created_at, 'MMM d, yyyy')}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditWorkspaceModal(ws)}
                            className="p-1 rounded text-slate-400 hover:text-copper-700 hover:bg-slate-100"
                            title="Edit Workspace"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setWorkspaceToDelete(ws)}
                            disabled={workspaces.length <= 1}
                            className={`p-1 rounded ${
                              workspaces.length <= 1
                                ? 'text-slate-200 cursor-not-allowed'
                                : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                            }`}
                            title={workspaces.length <= 1 ? 'Cannot delete the only workspace' : 'Delete Workspace'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed min-h-[32px]">
                        {ws.description || 'No description provided for this engineering workspace.'}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 font-mono text-[11px] text-slate-700">
                          <FolderOpen className="w-3.5 h-3.5 text-copper-600" />
                          <strong>{ws.project_count}</strong> {ws.project_count === 1 ? 'project' : 'projects'}
                        </span>
                        <span className="flex items-center gap-1 font-mono text-[11px] text-slate-700">
                          <Users className="w-3.5 h-3.5 text-emerald-600" />
                          <strong>{ws.member_count}</strong> {ws.member_count === 1 ? 'member' : 'members'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isActiveWorkspace ? (
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[11px] font-semibold flex items-center gap-1 shadow-2xs">
                            <Check className="w-3 h-3 text-emerald-600" /> Active
                          </span>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleSwitchWorkspace(ws.id, ws.name)}
                            disabled={isSwitchingWorkspace}
                            className="text-[11px] h-7 px-2.5 bg-copper-50 text-copper-800 hover:bg-copper-100 border-copper-200"
                          >
                            <ArrowRightLeft className="w-3 h-3 mr-1" />
                            Switch Into
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setManagingMembersWorkspace(ws)}
                          className="text-[11px] h-7 px-2 hover:bg-slate-100"
                          title="Manage team members"
                        >
                          Team
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: Create / Edit User */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? 'Edit User Details & Workspace' : 'Provision New Engineering User'}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
              onClick={handleSubmit(onUserFormSubmit)}
            >
              {editingUser ? 'Save Changes' : 'Create User'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(onUserFormSubmit)} className="flex flex-col gap-4">
          <Input
            label="Full Name"
            placeholder="e.g. Gowtham Thangaraj"
            required
            error={errors.full_name?.message}
            {...register('full_name')}
          />

          <Input
            label="Username"
            placeholder="e.g. gowtham"
            required
            error={errors.username?.message}
            {...register('username')}
          />

          <Input
            label="Email Address"
            type="email"
            placeholder="engineer@engineering.local"
            required
            error={errors.email?.message}
            {...register('email')}
          />

          <div className="grid grid-cols-2 gap-3">
            <Select label="Role Assignment" error={errors.role?.message} {...register('role')}>
              <option value="ENGINEER">Engineer</option>
              <option value="PROJECT_MANAGER">Project Manager</option>
              <option value="ADMIN">System Administrator</option>
            </Select>

            <Select
              label="Assigned Workspace"
              error={errors.workspace_id?.message}
              {...register('workspace_id')}
            >
              <option value="">No Workspace</option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  🏢 {ws.name}
                </option>
              ))}
            </Select>
          </div>

          {!editingUser && (
            <Input
              label="Initial Password"
              type="password"
              placeholder="Minimum 8 characters"
              required
              error={errors.password?.message}
              {...register('password')}
            />
          )}
        </form>
      </Modal>

      {/* MODAL 2: Create / Edit Workspace */}
      <Modal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        title={editingWorkspace ? 'Edit Workspace' : 'Create New Workspace'}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setIsWorkspaceModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={isSubmittingWorkspace}
              onClick={handleSubmitWorkspace(onWorkspaceFormSubmit)}
            >
              {editingWorkspace ? 'Save Changes' : 'Create Workspace'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitWorkspace(onWorkspaceFormSubmit)} className="flex flex-col gap-4">
          <Input
            label="Workspace Name"
            placeholder="e.g. Battery Management & Firmware Workspace"
            required
            error={workspaceErrors.name?.message}
            {...registerWorkspace('name')}
          />

          <Textarea
            label="Workspace Description"
            placeholder="Description of engineering teams and project scope..."
            error={workspaceErrors.description?.message}
            {...registerWorkspace('description')}
          />

          {!editingWorkspace && (
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <input
                type="checkbox"
                id="autoSwitch"
                checked={autoSwitchToCreated}
                onChange={(e) => setAutoSwitchToCreated(e.target.checked)}
                className="rounded border-slate-300 text-copper-600 focus:ring-copper-500 cursor-pointer"
              />
              <label htmlFor="autoSwitch" className="text-xs text-slate-700 cursor-pointer select-none font-medium">
                Switch into this workspace immediately after creation
              </label>
            </div>
          )}
        </form>
      </Modal>

      {/* MODAL 3: Manage Workspace Members */}
      <Modal
        isOpen={!!managingMembersWorkspace}
        onClose={() => {
          setManagingMembersWorkspace(null);
          setSelectedUserToAssign('');
        }}
        title={`Manage Members: ${managingMembersWorkspace?.name}`}
        size="lg"
      >
        <div className="flex flex-col gap-5">
          {/* Add member section */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Assign User to {managingMembersWorkspace?.name}
              </label>
              <select
                value={selectedUserToAssign}
                onChange={(e) => setSelectedUserToAssign(e.target.value)}
                className="w-full text-xs bg-white border border-border rounded-md px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-copper-500"
              >
                <option value="">Select an engineer or manager...</option>
                {allUsers
                  .filter((u) => u.workspace_id !== managingMembersWorkspace?.id)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.role.toLowerCase()}) — {u.workspace_name ? `currently in ${u.workspace_name}` : 'Unassigned'}
                    </option>
                  ))}
              </select>
            </div>

            <Button
              variant="primary"
              size="sm"
              disabled={!selectedUserToAssign}
              isLoading={assignMemberMutation.isPending}
              onClick={() => {
                if (selectedUserToAssign && managingMembersWorkspace) {
                  assignMemberMutation.mutate({
                    wsId: managingMembersWorkspace.id,
                    userId: selectedUserToAssign,
                  });
                }
              }}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              Assign to Workspace
            </Button>
          </div>

          {/* Current members list */}
          <div>
            <h4 className="text-xs font-semibold text-slate-700 mb-2.5">
              Assigned Members ({currentWsMembers.length})
            </h4>

            {isLoadingWsMembers ? (
              <div className="py-6 flex justify-center">
                <Clock className="w-5 h-5 text-copper-500 animate-spin" />
              </div>
            ) : currentWsMembers.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4 text-center bg-slate-50 border border-slate-100 rounded-lg">
                No members currently assigned to this workspace. Select an engineer above to assign them.
              </p>
            ) : (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {currentWsMembers.map((member) => (
                  <div
                    key={member.id}
                    className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar name={member.full_name} src={member.avatar_url} size="sm" />
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-900 leading-tight">
                          {member.full_name}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {member.email} • {member.role.toLowerCase()}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (managingMembersWorkspace) {
                          removeMemberMutation.mutate({
                            wsId: managingMembersWorkspace.id,
                            userId: member.id,
                          });
                        }
                      }}
                      disabled={removeMemberMutation.isPending}
                      className="px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 rounded border border-red-200 transition-colors inline-flex items-center gap-1"
                      title="Remove from this workspace"
                    >
                      <UserMinus className="w-3 h-3" />
                      <span>Remove</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* MODAL 4: Delete Workspace Confirmation */}
      <Modal
        isOpen={!!workspaceToDelete}
        onClose={() => setWorkspaceToDelete(null)}
        title="Delete Workspace"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Are you sure you want to delete this workspace?</p>
              <p className="mt-1 leading-relaxed">
                Deleting <strong>{workspaceToDelete?.name}</strong> will reassign any existing team members to another available workspace.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setWorkspaceToDelete(null)}
              disabled={deleteWorkspaceMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              isLoading={deleteWorkspaceMutation.isPending}
              onClick={() => workspaceToDelete && deleteWorkspaceMutation.mutate(workspaceToDelete.id)}
            >
              Delete Workspace
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm Status Change Dialog */}
      <ConfirmDialog
        isOpen={!!toggleConfirmUser}
        title={toggleConfirmUser?.is_active ? 'Deactivate User Account' : 'Activate User Account'}
        message={`Are you sure you want to ${
          toggleConfirmUser?.is_active ? 'deactivate' : 'activate'
        } ${toggleConfirmUser?.full_name}?`}
        confirmLabel={toggleConfirmUser?.is_active ? 'Deactivate' : 'Activate'}
        variant={toggleConfirmUser?.is_active ? 'danger' : 'primary'}
        onConfirm={() => toggleConfirmUser && toggleStatusMutation.mutate(toggleConfirmUser)}
        onClose={() => setToggleConfirmUser(null)}
      />

      {/* Confirm Password Reset Dialog */}
      <ConfirmDialog
        isOpen={!!resetConfirmUser}
        title="Reset Password"
        message={`Generate a new temporary password for ${resetConfirmUser?.full_name}?`}
        confirmLabel="Reset Password"
        variant="primary"
        onConfirm={() => resetConfirmUser && resetPasswordMutation.mutate(resetConfirmUser)}
        onClose={() => setResetConfirmUser(null)}
      />

      {/* Confirm Permanent Delete User Dialog */}
      <ConfirmDialog
        isOpen={!!userToDelete}
        title="Permanently Delete User"
        message={`Are you sure you want to permanently delete user "${userToDelete?.full_name || userToDelete?.username}" (${userToDelete?.email})? All assigned tasks will be unassigned and projects will be safely preserved.`}
        confirmLabel="Delete User"
        variant="danger"
        onConfirm={() => userToDelete && deleteUserMutation.mutate(userToDelete.id)}
        onClose={() => setUserToDelete(null)}
      />
    </div>
  );
};

export default UsersPage;
