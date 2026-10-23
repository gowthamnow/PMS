export type UserRole = 'ADMIN' | 'PROJECT_MANAGER' | 'ENGINEER';
export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'DONE';

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  project_count: number;
  member_count: number;
}

export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  avatar_url?: string;
  workspace_id?: string;
  workspace_name?: string;
  created_at: string;
  last_login?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  objectives?: string;
  status: ProjectStatus;
  priority: Priority;
  start_date?: string;
  target_date?: string;
  created_by: string;
  created_at: string;
  workspace_id?: string;
  workspace_name?: string;
  member_count?: number;
  task_count?: number;
  completed_task_count?: number;
  project_manager?: User;
  image_url?: string;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  user: User;
}

export interface Task {
  id: string;
  project_id: string;
  task_number: number;
  title: string;
  description?: string;
  acceptance_criteria?: string;
  status: TaskStatus;
  priority: Priority;
  assignee_id?: string;
  assignee?: User;
  creator_id: string;
  reviewer_id?: string;
  reviewer?: User;
  estimated_hours?: number;
  logged_hours?: number;
  start_date?: string;
  due_date?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  git_refs?: GitRef[];
  comment_count?: number;
  project?: Project;
}

export interface GitRef {
  type: 'commit' | 'pr';
  ref: string;
  url?: string;
  message?: string;
  author?: string;
  timestamp?: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  user?: User;
  content: string;
  created_at: string;
  updated_at: string;
  is_edited: boolean;
}

export interface Attachment {
  id: string;
  task_id: string;
  project_id: string;
  filename: string;
  file_size: number;
  content_type: string;
  created_at: string;
  user?: User;
}

export interface TimeEntry {
  id: string;
  task_id: string;
  project_id: string;
  user_id: string;
  user?: User;
  task?: Task;
  work_date: string;
  duration_hours: number;
  description?: string;
  created_at: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  related_task_id?: string;
  related_project_id?: string;
  created_at: string;
}

export interface GiteaRepo {
  id: string;
  project_id: string;
  repo_full_name: string;
  repo_url: string;
  default_branch: string;
  is_active: boolean;
  avatar_url?: string;
  last_synced_at?: string;
}

export interface GiteaCommit {
  id: string;
  sha: string;
  message: string;
  author: string;
  author_email?: string;
  timestamp: string;
  url?: string;
}

export interface GiteaPullRequest {
  id: string;
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  updated_at: string;
  url?: string;
}

export interface GiteaBranch {
  name: string;
  commit_sha: string;
  is_default: boolean;
}

export interface ActivityItem {
  id: string;
  type: 'task_created' | 'task_updated' | 'comment_added' | 'git_push' | 'pr_opened' | 'member_added';
  user: User;
  message: string;
  created_at: string;
  task_id?: string;
  project_id?: string;
}

export interface DashboardStats {
  total_projects: number;
  active_projects: number;
  tasks_by_status: Record<TaskStatus, number>;
  overdue_tasks: number;
  upcoming_deadlines: Task[];
  workload_by_user: WorkloadItem[];
  hours_logged_this_week: number;
}

export interface WorkloadItem {
  user_id?: string;
  username?: string;
  full_name?: string;
  role?: string;
  email?: string;
  user?: User;
  todo: number;
  in_progress: number;
  in_review: number;
  blocked: number;
  done: number;
  total?: number;
  total_tasks?: number;
  hours_this_week: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface StorageQuota {
  used_bytes: number;
  quota_bytes: number;
  used_percentage: number;
  total_files: number;
}

export interface SystemInfo {
  version: string;
  environment: string;
  database_status: 'healthy' | 'unhealthy';
  uptime_seconds: number;
  storage: StorageQuota;
}

export interface AuditLogEntry {
  id: string;
  user_id?: string;
  user_name?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  details?: string;
  ip_address?: string;
  created_at: string;
}


export interface Message {
  id: string;
  sender_id: string;
  recipient_id?: string;
  project_id?: string;
  content: string;
  attachment_url?: string;
  is_read: boolean;
  created_at: string;
  sender?: User;
  recipient?: User;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'channel';
  title: string;
  subtitle?: string;
  avatar_url?: string;
  recipient_id?: string;
  project_id?: string;
  last_message?: string;
  last_message_at?: string;
  unread_count: number;
}

// ==========================================
// File Management Vault & Folders
// ==========================================
export interface ProjectFolder {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  file_count?: number;
  total_bytes?: number;
}

export interface ProjectVaultFile {
  id: string;
  project_id: string;
  folder_id?: string;
  filename: string;
  stored_filename: string;
  file_size: number;
  content_type: string;
  category: string;
  description?: string;
  uploaded_by?: string;
  uploader?: User;
  created_at: string;
  updated_at: string;
}

export interface ProjectVaultStats {
  total_files: number;
  total_bytes: number;
  folders_count: number;
  categories: Record<string, number>;
}

// ==========================================
// AI & Task Solver Types
// ==========================================
export interface CodeFixItem {
  file_path?: string;
  description: string;
  code_snippet: string;
  language?: string;
}

export interface TaskSolveResponse {
  task_id: string;
  task_title: string;
  issue_type: string;
  root_cause: string;
  solution_summary: string;
  action_plan: string[];
  code_fixes: CodeFixItem[];
  code_patches?: any[];
  testing_steps: string[];
  formatted_markdown: string;
  comment_posted: boolean;
  comment_id?: string;
  ai_provider: string;
  tokens_used?: number;
  remaining_quota?: number;
}

export interface ProjectCopilotResponse {
  project_id: string;
  project_name: string;
  query: string;
  analysis: string;
  recommended_solutions: string[];
  circuit_or_code_advice?: string;
  suggested_tasks: string[];
  formatted_markdown: string;
  ai_provider: string;
  tokens_used?: number;
  remaining_quota?: number;
}

export interface AIChatRequest {
  message: string;
  project_id?: string;
  model?: string;
}

export interface AIChatResponse {
  reply: string;
  tokens_used: number;
  remaining_quota: number;
  ai_provider: string;
}

export interface AIConfigInfo {
  has_api_key: boolean;
  provider: string;
  model: string;
  available_models?: string[];
  features: string[];
  member_daily_limit: number;
  member_max_tokens: number;
  user_remaining_quota?: number;
  is_admin: boolean;
}

export interface BackupStatus {
  git_branch: string;
  git_commit: string;
  git_commit_date: string;
  git_clean: boolean;
  latest_db_snapshot?: string;
  latest_db_snapshot_size?: string;
  latest_db_snapshot_time?: string;
  backup_directory: string;
  total_snapshots: number;
  restore_command: string;
}

