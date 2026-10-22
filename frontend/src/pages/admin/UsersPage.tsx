import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { User, UserRole } from '../../types';
import { Table, Column } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Avatar } from '../../components/ui/Avatar';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { formatDate } from '../../lib/utils';
import {
  UserPlus,
  Edit2,
  KeyRound,
  UserX,
  UserCheck,
  Search,
  Users,
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
});

type UserFormData = z.infer<typeof userSchema>;

export const UsersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [toggleConfirmUser, setToggleConfirmUser] = useState<User | null>(null);
  const [resetConfirmUser, setResetConfirmUser] = useState<User | null>(null);

  // Fetch Users
  const { data, isLoading } = useQuery({
    queryKey: ['users', { page, search }],
    queryFn: () => api.users.getUsers(page, 15, search || undefined),
  });

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
    });
    setIsModalOpen(true);
  };

  // Create User Mutation
  const createMutation = useMutation({
    mutationFn: (userData: UserFormData) => api.users.createUser(userData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsModalOpen(false);
      toast.success('User account created');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to create user');
    },
  });

  // Update User Mutation
  const updateMutation = useMutation({
    mutationFn: (userData: UserFormData) => api.users.updateUser(editingUser!.id, userData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsModalOpen(false);
      toast.success('User account updated');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to update user');
    },
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
    onSuccess: (res) => {
      setResetConfirmUser(null);
      if (res.temporary_password) {
        toast((t) => (
          <div className="flex flex-col gap-1 text-xs">
            <span className="font-bold">Temporary Password Generated:</span>
            <code className="bg-slate-100 p-1 rounded font-mono font-bold text-copper-700">
              {res.temporary_password}
            </code>
            <span className="text-[10px] text-text-muted">Copy this now to share securely.</span>
          </div>
        ), { duration: 10000 });
      } else {
        toast.success(res.message || 'Password reset instruction sent');
      }
    },
    onError: () => toast.error('Failed to reset password'),
  });

  const onFormSubmit = async (formData: UserFormData) => {
    if (editingUser) {
      await updateMutation.mutateAsync(formData);
    } else {
      await createMutation.mutateAsync(formData);
    }
  };

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Full Name',
      render: (u) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={u.full_name} size="sm" />
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
      key: 'status',
      header: 'Status',
      render: (u) => (
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border ${
            u.is_active
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-slate-100 text-slate-500 border-slate-200'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-green-600' : 'bg-slate-400'}`}
          />
          {u.is_active ? 'Active' : 'Inactive'}
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
                ? 'text-text-muted hover:text-red-600 hover:bg-red-50'
                : 'text-text-muted hover:text-green-600 hover:bg-green-50'
            }`}
            title={u.is_active ? 'Deactivate Account' : 'Activate Account'}
          >
            {u.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">User Management</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Administer accounts, roles, access levels, and security credentials.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          leftIcon={<UserPlus className="w-4 h-4" />}
          onClick={openCreateModal}
        >
          Create User
        </Button>
      </div>

      {/* Filter and Search */}
      <div className="bg-white p-3 border border-border rounded-lg shadow-subtle flex items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, email, or username..."
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
        page={data?.page || 1}
        totalPages={data?.pages || 1}
        totalCount={data?.total || 0}
        onPageChange={setPage}
        emptyMessage="No users found."
        emptyIcon={<Users className="w-8 h-8 text-slate-300" />}
      />

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? `Edit Account: ${editingUser.full_name}` : 'Create Engineering User'}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
              onClick={handleSubmit(onFormSubmit)}
            >
              {editingUser ? 'Save Updates' : 'Create Account'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-4">
          <Input
            label="Full Name"
            placeholder="e.g. Alice Chen"
            required
            error={errors.full_name?.message}
            {...register('full_name')}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Username"
              placeholder="achen"
              required
              disabled={!!editingUser}
              error={errors.username?.message}
              {...register('username')}
            />
            <Input
              label="Engineering Email"
              type="email"
              placeholder="achen@hardware.internal"
              required
              error={errors.email?.message}
              {...register('email')}
            />
          </div>

          <Select label="Role" required error={errors.role?.message} {...register('role')}>
            <option value="ENGINEER">Engineer (Hardware / Firmware / PCB)</option>
            <option value="PROJECT_MANAGER">Project Manager</option>
            <option value="ADMIN">System Administrator</option>
          </Select>

          {!editingUser && (
            <Input
              label="Initial Password"
              type="password"
              placeholder="Min 8 characters"
              required
              error={errors.password?.message}
              {...register('password')}
            />
          )}
        </form>
      </Modal>

      {/* Deactivate/Activate Confirm Dialog */}
      {toggleConfirmUser && (
        <ConfirmDialog
          isOpen={!!toggleConfirmUser}
          onClose={() => setToggleConfirmUser(null)}
          title={toggleConfirmUser.is_active ? 'Deactivate User Account' : 'Reactivate User Account'}
          message={`Are you sure you want to ${
            toggleConfirmUser.is_active ? 'deactivate' : 'reactivate'
          } the account for ${toggleConfirmUser.full_name}?`}
          confirmLabel={toggleConfirmUser.is_active ? 'Deactivate' : 'Activate'}
          variant={toggleConfirmUser.is_active ? 'danger' : 'primary'}
          isLoading={toggleStatusMutation.isPending}
          onConfirm={() => toggleStatusMutation.mutate(toggleConfirmUser)}
        />
      )}

      {/* Reset Password Confirm Dialog */}
      {resetConfirmUser && (
        <ConfirmDialog
          isOpen={!!resetConfirmUser}
          onClose={() => setResetConfirmUser(null)}
          title="Reset Account Password"
          message={`Generate a new temporary password for ${resetConfirmUser.full_name} (${resetConfirmUser.email})?`}
          confirmLabel="Reset Password"
          variant="primary"
          isLoading={resetPasswordMutation.isPending}
          onConfirm={() => resetPasswordMutation.mutate(resetConfirmUser)}
        />
      )}
    </div>
  );
};
