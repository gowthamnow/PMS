import axios, { AxiosInstance } from 'axios';
import {
  User,
  Project,
  Workspace,
  Task,
  TaskComment,
  Attachment,
  TimeEntry,
  Notification,
  DashboardStats,
  PaginatedResponse,
  StorageQuota,
  SystemInfo,
  AuditLogEntry,
  Message,
  Conversation,
  WorkloadItem,
  ProjectFolder,
  ProjectVaultFile,
  ProjectVaultStats,
  TaskSolveResponse,
  ProjectCopilotResponse,
  AIChatResponse,
  AIConfigInfo,
  BackupStatus,
  AITaskExecution,
  AIControlCenterStats,
  AIEngineConfig,
} from '../types';

export const apiClient: AxiosInstance = axios.create({
  baseURL: '/api',
});

// Interceptor for JWT Bearer token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('pms_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor to unpack response data and handle session expiry
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('pms_token');
      if (
        typeof window !== 'undefined' &&
        window.location.pathname !== '/login' &&
        window.location.pathname !== '/lobby'
      ) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const api = {
  auth: {
    login: (username: string, password: string): Promise<any> =>
      apiClient.post('/auth/login', { username, password }),
    googleLogin: (data: { credential?: string; email?: string; full_name?: string; avatar_url?: string }): Promise<any> =>
      apiClient.post('/auth/google', data),
    me: (): Promise<User> => apiClient.get('/auth/me'),
    logout: (): Promise<any> => apiClient.post('/auth/logout'),
    changePassword: (oldPassword: string, newPassword: string): Promise<any> =>
      apiClient.post('/auth/change-password', {
        old_password: oldPassword,
        new_password: newPassword,
      }),
    updateProfile: (data: { full_name?: string; email?: string; avatar_url?: string }): Promise<User> =>
      apiClient.put('/auth/profile', data),
    getGoogleConfig: (): Promise<{ client_id: string; has_client_id: boolean }> =>
      apiClient.get('/auth/google-config'),
    updateGoogleConfig: (clientId: string): Promise<any> =>
      apiClient.post('/auth/google-config', { client_id: clientId }),
    getLobbyStatus: (email: string, lobbyToken?: string | null): Promise<{
      status: string;
      approved: boolean;
      access_token?: string;
      token_type?: string;
      user?: User;
      email?: string;
      full_name?: string;
      avatar_url?: string;
      created_at?: string;
    }> => {
      const q = new URLSearchParams({ email });
      if (lobbyToken) q.append('lobby_token', lobbyToken);
      return apiClient.get(`/auth/lobby-status?${q.toString()}`);
    },
    resendLobbyAlert: (email: string): Promise<{ message: string }> =>
      apiClient.post('/auth/lobby-resend-alert', { email }),
  },

  users: {
    getUsers: (
      pageOrParams: number | any = 1,
      pageSize: number = 20,
      search?: string
    ): Promise<PaginatedResponse<User>> => {
      if (typeof pageOrParams === 'object' && pageOrParams !== null) {
        return apiClient.get('/users', { params: pageOrParams });
      }
      return apiClient.get('/users', {
        params: {
          page: pageOrParams,
          page_size: pageSize,
          search: search || undefined,
        },
      });
    },
    getUser: (id: string): Promise<User> => apiClient.get(`/users/${id}`),
    createUser: (data: any): Promise<User> => apiClient.post('/users', data),
    updateUser: (id: string, data: any): Promise<User> => apiClient.put(`/users/${id}`, data),
    deleteUser: (id: string): Promise<any> => apiClient.delete(`/users/${id}`),
    deactivateUser: (id: string): Promise<any> => apiClient.post(`/users/${id}/deactivate`),
    activateUser: (id: string): Promise<User> => apiClient.put(`/users/${id}`, { is_active: true }),
    approveUser: (id: string): Promise<any> => apiClient.post(`/users/${id}/approve`),
    uploadAvatar: (file: File): Promise<{ avatar_url: string; message: string }> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.post('/users/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    resetPassword: (id: string, newPassword?: string): Promise<any> =>
      apiClient.post(`/users/${id}/reset-password`, {
        new_password: newPassword || 'EngPass2026#Secure',
      }),
  },

  workspaces: {
    getWorkspaces: (): Promise<Workspace[]> => apiClient.get('/workspaces'),
    getWorkspace: (id: string): Promise<Workspace> => apiClient.get(`/workspaces/${id}`),
    createWorkspace: (data: { name: string; description?: string }): Promise<Workspace> =>
      apiClient.post('/workspaces', data),
    updateWorkspace: (id: string, data: { name?: string; description?: string }): Promise<Workspace> =>
      apiClient.put(`/workspaces/${id}`, data),
    deleteWorkspace: (id: string): Promise<any> => apiClient.delete(`/workspaces/${id}`),
    getWorkspaceMembers: (id: string): Promise<User[]> => apiClient.get(`/workspaces/${id}/members`),
    assignMember: (workspaceId: string, userId: string): Promise<any> =>
      apiClient.post(`/workspaces/${workspaceId}/assign-member`, { user_id: userId }),
    removeMember: (workspaceId: string, userId: string): Promise<any> =>
      apiClient.post(`/workspaces/${workspaceId}/remove-member`, { user_id: userId }),
    switchWorkspace: (workspaceId: string | null): Promise<User> =>
      apiClient.post('/workspaces/switch', { workspace_id: workspaceId }),
  },

  projects: {
    getProjects: (params?: any): Promise<PaginatedResponse<Project>> =>
      apiClient.get('/projects', { params }),
    getProject: (id: string): Promise<Project> => apiClient.get(`/projects/${id}`),
    getProjectStats: (id: string): Promise<any> => apiClient.get(`/projects/${id}/stats`),
    createProject: (data: any): Promise<Project> => apiClient.post('/projects', data),
    updateProject: (id: string, data: any): Promise<Project> =>
      apiClient.put(`/projects/${id}`, data),
    deleteProject: (id: string): Promise<any> => apiClient.delete(`/projects/${id}`),
    getProjectMembers: (id: string): Promise<any[]> => apiClient.get(`/projects/${id}/members`),
    addProjectMember: (
      projectId: string,
      userIdOrData: string | { user_id: string; role?: string },
      role?: string
    ): Promise<any> => {
      const body =
        typeof userIdOrData === 'string'
          ? { user_id: userIdOrData, role: role || 'MEMBER' }
          : userIdOrData;
      return apiClient.post(`/projects/${projectId}/members`, body);
    },
    updateProjectMemberRole: (projectId: string, userId: string, role: string): Promise<any> =>
      apiClient.put(`/projects/${projectId}/members/${userId}`, { role }),
    removeProjectMember: (projectId: string, userId: string): Promise<any> =>
      apiClient.delete(`/projects/${projectId}/members/${userId}`),
    uploadProjectImage: (projectId: string, file: File): Promise<any> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.post(`/projects/${projectId}/image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
  },

  tasks: {
    getTasks: (params?: any): Promise<PaginatedResponse<Task>> =>
      apiClient.get('/tasks', { params }),
    getTask: (id: string): Promise<Task> => apiClient.get(`/tasks/${id}`),
    createTask: (data: any): Promise<Task> => apiClient.post('/tasks', data),
    updateTask: (id: string, data: any): Promise<Task> => apiClient.put(`/tasks/${id}`, data),
    deleteTask: (id: string): Promise<any> => apiClient.delete(`/tasks/${id}`),
    updateTaskStatus: (taskId: string, status: string): Promise<Task> =>
      apiClient.patch(`/tasks/${taskId}/status`, { status }),
    addComment: (taskId: string, contentOrData: string | { content: string }): Promise<TaskComment> => {
      const body =
        typeof contentOrData === 'string' ? { content: contentOrData } : contentOrData;
      return apiClient.post(`/tasks/${taskId}/comments`, body);
    },
    getComments: (taskId: string): Promise<TaskComment[]> =>
      apiClient.get(`/tasks/${taskId}/comments`),
    getTaskComments: (taskId: string): Promise<TaskComment[]> =>
      apiClient.get(`/tasks/${taskId}/comments`),
    deleteComment: (taskId: string, commentId: string): Promise<any> =>
      apiClient.delete(`/tasks/${taskId}/comments/${commentId}`),
    logWork: (data: any): Promise<TimeEntry> => apiClient.post('/time-entries', data),
    addTimeEntry: (data: any): Promise<TimeEntry> => apiClient.post('/time-entries', data),
    getTimeEntries: async (params?: any): Promise<TimeEntry[]> => {
      const res: any = await apiClient.get('/time-entries', { params });
      return Array.isArray(res) ? res : res?.items || [];
    },
    deleteTimeEntry: (id: string): Promise<any> => apiClient.delete(`/time-entries/${id}`),
    sendDelayInquiry: (taskId: string, message?: string, urgency: string = 'HIGH'): Promise<any> =>
      apiClient.post(`/tasks/${taskId}/delay-inquiry`, { message, urgency }),
    checkStaleNotifications: (
      hoursThreshold?: number,
      forceAll: boolean = false,
      projectId?: string
    ): Promise<any> =>
      apiClient.post('/tasks/check-stale-notifications', null, {
        params: {
          hours_threshold: hoursThreshold,
          force_all: forceAll,
          project_id: projectId,
        },
      }),
    triggerMorningReminder: (forceAll: boolean = false): Promise<any> =>
      apiClient.post('/tasks/trigger-morning-reminder', null, {
        params: { force_all: forceAll },
      }),
    triggerEveningReminder: (): Promise<any> =>
      apiClient.post('/tasks/trigger-evening-reminder'),
    addGitRef: (taskId: string, data: any): Promise<Task> =>
      apiClient.post(`/tasks/${taskId}/git-ref`, data),
  },

  attachments: {
    getAttachments: (params?: any): Promise<Attachment[]> =>
      apiClient.get('/attachments', { params }),
    uploadAttachment: (
      target:
        | string
        | { taskId?: string; projectId?: string; task_id?: string; project_id?: string },
      file?: File
    ): Promise<Attachment> => {
      const formData = new FormData();
      if (typeof target === 'string') {
        if (file) formData.append('file', file);
        formData.append('task_id', target);
      } else if (target && typeof target === 'object') {
        if (file) formData.append('file', file);
        if (target.taskId || target.task_id) {
          formData.append('task_id', (target.taskId || target.task_id)!);
        }
        if (target.projectId || target.project_id) {
          formData.append('project_id', (target.projectId || target.project_id)!);
        }
      }
      return apiClient.post('/attachments/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    deleteAttachment: (id: string): Promise<any> => apiClient.delete(`/attachments/${id}`),
    downloadAttachment: async (id: string, filename?: string): Promise<Blob> => {
      const token = localStorage.getItem('pms_token');
      const response = await axios.get(`/api/attachments/${id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename || 'attachment');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      return response.data;
    },
    getQuota: (): Promise<StorageQuota> => apiClient.get('/attachments/quota'),
  },

  dashboard: {
    getDashboardStats: (): Promise<DashboardStats> => apiClient.get('/dashboard/stats'),
    getStats: (): Promise<DashboardStats> => apiClient.get('/dashboard/stats'),
    getRecentActivity: async (limit: number = 20): Promise<any[]> => {
      const res: any = await apiClient.get('/dashboard/activity', { params: { limit } });
      return res?.activities || res?.items || res || [];
    },
    getActivity: async (limit: number = 20): Promise<any[]> => {
      const res: any = await apiClient.get('/dashboard/activity', { params: { limit } });
      return res?.activities || res?.items || res || [];
    },
  },

  reports: {
    getTeamWorkload: (): Promise<WorkloadItem[]> => apiClient.get('/reports/team-workload'),
    getProjectMetrics: (): Promise<any> => apiClient.get('/reports/project-progress'),
    getProjectProgress: (): Promise<any> => apiClient.get('/reports/project-progress'),
    getTimeLog: (params?: any): Promise<any> => apiClient.get('/reports/time-log', { params }),
    getOverdueTasks: (): Promise<any[]> => apiClient.get('/reports/overdue-tasks'),
    exportCSV: async (type: string = 'time_log', params?: any): Promise<Blob> => {
      const token = localStorage.getItem('pms_token');
      const response = await axios.get('/api/reports/export/csv', {
        params: { type, ...params },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `${type}_report_${new Date().toISOString().split('T')[0]}.csv`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      return response.data;
    },
  },

  notifications: {
    getNotifications: (
      page: number = 1,
      pageSize: number = 20
    ): Promise<PaginatedResponse<Notification>> =>
      apiClient.get('/notifications', { params: { page, page_size: pageSize } }),
    getUnreadCount: (): Promise<{ count: number }> =>
      apiClient.get('/notifications/unread-count'),
    markAsRead: (id: string): Promise<Notification> =>
      apiClient.patch(`/notifications/${id}/read`),
    markRead: (id: string): Promise<Notification> =>
      apiClient.patch(`/notifications/${id}/read`),
    markAllAsRead: (): Promise<any> => apiClient.patch('/notifications/read-all'),
    markAllRead: (): Promise<any> => apiClient.patch('/notifications/read-all'),
  },

  messages: {
    getConversations: (): Promise<Conversation[]> => apiClient.get('/messages/conversations'),
    getMessages: (params: { recipient_id?: string; project_id?: string; limit?: number }): Promise<Message[]> =>
      apiClient.get('/messages', { params }),
    sendMessage: (data: { content: string; recipient_id?: string; project_id?: string; attachment_url?: string }): Promise<Message> =>
      apiClient.post('/messages', data),
  },

  system: {
    getInfo: (): Promise<SystemInfo | any> => apiClient.get('/admin/system-info'),
    getAuditLogs: (
      page: number = 1,
      pageSize: number = 20
    ): Promise<PaginatedResponse<AuditLogEntry>> =>
      apiClient.get('/admin/audit-log', { params: { page, page_size: pageSize } }),
  },

  ai: {
    chat: (message: string, projectId?: string, model?: string): Promise<AIChatResponse> =>
      apiClient.post('/ai/chat', {
        message,
        project_id: projectId || undefined,
        model: model || 'gemini-1.5-pro',
      }),
    solveTask: (taskId: string, autoPostComment?: boolean, customInstruction?: string, model?: string): Promise<TaskSolveResponse> => {
      const q = new URLSearchParams();
      if (autoPostComment) q.append('auto_post_comment', 'true');
      if (customInstruction) q.append('custom_instruction', customInstruction);
      if (model) q.append('model', model);
      return apiClient.post(`/ai/solve-task/${taskId}?${q.toString()}`);
    },
    consultProjectCopilot: (projectId: string, problemDescription: string, category?: string, model?: string): Promise<ProjectCopilotResponse> =>
      apiClient.post(`/ai/project-copilot/${projectId}`, {
        project_id: projectId,
        problem_description: problemDescription,
        category: category || 'GENERAL',
        model: model || 'gemini-1.5-pro',
      }),
    getConfig: (): Promise<AIConfigInfo> =>
      apiClient.get('/ai/config'),
    updateConfig: (apiKey: string, model?: string): Promise<any> =>
      apiClient.post('/ai/config', { api_key: apiKey, model: model || 'gemini-1.5-pro' }),
  },

  vault: {
    getFolders: (projectId: string): Promise<ProjectFolder[]> =>
      apiClient.get(`/projects/${projectId}/folders`),
    createFolder: (projectId: string, data: { name: string; description?: string; color?: string; icon?: string }): Promise<ProjectFolder> =>
      apiClient.post(`/projects/${projectId}/folders`, data),
    deleteFolder: (projectId: string, folderId: string): Promise<any> =>
      apiClient.delete(`/projects/${projectId}/folders/${folderId}`),
    getFiles: (projectId: string, params?: { folder_id?: string; category?: string; search?: string }): Promise<ProjectVaultFile[]> =>
      apiClient.get(`/projects/${projectId}/vault-files`, { params }),
    uploadFile: (projectId: string, file: File, folderId?: string, category?: string, description?: string): Promise<ProjectVaultFile> => {
      const formData = new FormData();
      formData.append('file', file);
      if (folderId) formData.append('folder_id', folderId);
      if (category) formData.append('category', category);
      if (description) formData.append('description', description);
      return apiClient.post(`/projects/${projectId}/vault-files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    downloadFile: async (fileId: string, filename: string): Promise<void> => {
      const res = await apiClient.get(`/vault/files/${fileId}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    },
    deleteFile: (fileId: string): Promise<any> =>
      apiClient.delete(`/vault/files/${fileId}`),
    getStats: (projectId: string): Promise<ProjectVaultStats> =>
      apiClient.get(`/projects/${projectId}/vault-stats`),
  },

  backup: {
    getStatus: (): Promise<BackupStatus> => apiClient.get('/backup/status'),
    createBackup: (): Promise<{ message: string; snapshot_filename: string; details: string; restore_command: string }> =>
      apiClient.post('/backup/create'),
    downloadSnapshot: async (): Promise<void> => {
      const res = await apiClient.get('/backup/download-snapshot', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `db_snapshot_latest_${new Date().toISOString().slice(0, 10)}.sql.gz`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    },
  },

  aiOrchestrator: {
    createExecution: (data: { task_id: string; autonomy_level?: number; model_override?: string; custom_instructions?: string }): Promise<AITaskExecution> =>
      apiClient.post('/ai/orchestrator/executions', data),
    getExecution: (executionId: string): Promise<AITaskExecution> =>
      apiClient.get(`/ai/orchestrator/executions/${executionId}`),
    getExecutionByTask: (taskId: string): Promise<AITaskExecution | null> =>
      apiClient.get(`/ai/orchestrator/executions/task/${taskId}`),
    approvePlan: (executionId: string, is_approved: boolean, feedback?: string): Promise<AITaskExecution> =>
      apiClient.post(`/ai/orchestrator/executions/${executionId}/approve-plan`, { is_approved, feedback }),
    cancelExecution: (executionId: string): Promise<AITaskExecution> =>
      apiClient.post(`/ai/orchestrator/executions/${executionId}/cancel`),
    retryExecution: (executionId: string): Promise<AITaskExecution> =>
      apiClient.post(`/ai/orchestrator/executions/${executionId}/retry`),
    getControlCenterStats: (): Promise<AIControlCenterStats> =>
      apiClient.get('/ai/orchestrator/control-center'),
    getConfig: (): Promise<AIEngineConfig> =>
      apiClient.get('/ai/orchestrator/config'),
    updateConfig: (data: Partial<AIEngineConfig & { github_token?: string; gemini_api_key?: string }>): Promise<AIEngineConfig> =>
      apiClient.put('/ai/orchestrator/config', data),
  },
};

export default api;
