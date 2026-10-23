import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import {
  Bell,
  ChevronRight,
  LogOut,
  User as UserIcon,
  Key,
  ChevronDown,
  Check,
  Building,
  Layers,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';

export interface TopNavProps {
  isSidebarCollapsed: boolean;
}

export const TopNav: React.FC<TopNavProps> = ({ isSidebarCollapsed }) => {
  const { user, logout, switchWorkspace } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);
  const workspaceDropdownRef = useRef<HTMLDivElement>(null);
  const [isSwitchingWorkspace, setIsSwitchingWorkspace] = useState(false);

  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.notifications.getUnreadCount(),
    refetchInterval: 30000,
  });

  const { data: workspaces = [] } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api.workspaces.getWorkspaces(),
    enabled: user?.role === 'ADMIN',
  });

  const unreadCount = unreadData?.count || 0;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setDropdownOpen(false);
      }
      if (workspaceDropdownRef.current && !workspaceDropdownRef.current.contains(target)) {
        setWorkspaceDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectWorkspace = async (workspaceId: string | null, workspaceName: string) => {
    if (isSwitchingWorkspace) return;
    setIsSwitchingWorkspace(true);
    try {
      await switchWorkspace(workspaceId);
      await queryClient.invalidateQueries();
      toast.success(`Active Workspace: ${workspaceName}`, { id: 'ws-switch' });
      setWorkspaceDropdownOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to switch workspace');
    } finally {
      setIsSwitchingWorkspace(false);
    }
  };

  // Format breadcrumbs from pathname
  const pathParts = location.pathname.split('/').filter(Boolean);
  const breadcrumbItems = pathParts.map((part, index) => {
    const url = `/${pathParts.slice(0, index + 1).join('/')}`;
    const isLast = index === pathParts.length - 1;
    let title = part.charAt(0).toUpperCase() + part.slice(1);
    if (part === 'admin') title = 'Admin';
    if (part === 'board') title = 'Task Board';

    return { title, url, isLast };
  });

  return (
    <header
      className={`fixed top-0 right-0 z-20 h-[60px] bg-white border-b border-border transition-all duration-300 flex items-center justify-between px-6 ${
        isSidebarCollapsed ? 'left-[64px]' : 'left-[240px]'
      }`}
    >
      {/* Breadcrumb Left */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-text-secondary">
        <Link to="/dashboard" className="hover:text-text-primary font-medium transition-colors">
          Workspace
        </Link>
        {breadcrumbItems.map((item) => (
          <React.Fragment key={item.url}>
            <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
            {item.isLast ? (
              <span className="font-semibold text-text-primary">{item.title}</span>
            ) : (
              <Link to={item.url} className="hover:text-text-primary transition-colors">
                {item.title}
              </Link>
            )}
          </React.Fragment>
        ))}
      </nav>

      {/* Right User Actions & Workspace Pill */}
      <div className="flex items-center gap-3">
        {/* Workspace Switcher Pill & Dropdown */}
        {user?.role === 'ADMIN' ? (
          <div className="relative" ref={workspaceDropdownRef}>
            <button
              type="button"
              onClick={() => setWorkspaceDropdownOpen(!workspaceDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-medium text-slate-800 transition-all shadow-2xs hover:border-slate-300"
              title="Click to switch active engineering workspace"
            >
              <span className="text-copper-600 font-bold">🏢</span>
              <span className="font-semibold max-w-[140px] md:max-w-[180px] truncate">
                {user?.workspace_name || 'All Workspaces (Admin)'}
              </span>
              <span className="text-[10px] bg-white border border-slate-200 text-slate-500 px-1.5 py-0.2 rounded font-mono font-normal">
                Switch
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                  workspaceDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {workspaceDropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white border border-border rounded-xl shadow-modal py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3.5 py-2 border-b border-border bg-slate-50/70 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Building className="w-4 h-4 text-copper-600" />
                    <span>Select Active Workspace</span>
                  </div>
                  <Link
                    to="/admin/users?tab=workspaces"
                    onClick={() => setWorkspaceDropdownOpen(false)}
                    className="text-[11px] text-copper-600 hover:text-copper-700 font-medium hover:underline flex items-center gap-1"
                  >
                    <Settings className="w-3 h-3" />
                    <span>Manage</span>
                  </Link>
                </div>

                <div className="py-1 max-h-64 overflow-y-auto">
                  {/* Option 1: All Workspaces (Admin Overview) */}
                  <button
                    type="button"
                    onClick={() => handleSelectWorkspace(null, 'All Workspaces (Admin)')}
                    className={`w-full px-3.5 py-2.5 text-left text-xs flex items-center justify-between transition-colors hover:bg-slate-50 ${
                      !user?.workspace_id
                        ? 'bg-copper-50/70 font-semibold text-copper-900'
                        : 'text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-slate-200/80 flex items-center justify-center text-slate-700 shrink-0">
                        <Layers className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="leading-tight">All Workspaces (Global)</span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          Company-wide consolidated view
                        </span>
                      </div>
                    </div>
                    {!user?.workspace_id && <Check className="w-4 h-4 text-copper-600 shrink-0" />}
                  </button>

                  <div className="my-1 border-t border-slate-100" />

                  {/* Individual Workspaces */}
                  {workspaces.map((ws) => {
                    const isSelected = user?.workspace_id === ws.id;
                    return (
                      <button
                        key={ws.id}
                        type="button"
                        onClick={() => handleSelectWorkspace(ws.id, ws.name)}
                        className={`w-full px-3.5 py-2.5 text-left text-xs flex items-center justify-between transition-colors hover:bg-slate-50 ${
                          isSelected
                            ? 'bg-copper-50/70 font-semibold text-copper-900'
                            : 'text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className="w-6 h-6 rounded-md bg-copper-50 border border-copper-100 flex items-center justify-center text-copper-700 shrink-0 text-xs">
                            🏢
                          </div>
                          <div className="flex flex-col truncate">
                            <span className="leading-tight truncate">{ws.name}</span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              {ws.project_count} {ws.project_count === 1 ? 'project' : 'projects'} •{' '}
                              {ws.member_count} {ws.member_count === 1 ? 'member' : 'members'}
                            </span>
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-copper-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                <div className="px-3.5 py-2 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Restricted to caller permissions</span>
                  <Link
                    to="/admin/users?tab=workspaces"
                    onClick={() => setWorkspaceDropdownOpen(false)}
                    className="text-copper-700 font-semibold hover:underline"
                  >
                    + New Workspace
                  </Link>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700"
            title="Your assigned workspace"
          >
            <span className="text-copper-600 font-bold">🏢</span>
            <span className="font-semibold text-slate-900">
              {user?.workspace_name || 'Engineering Workspace'}
            </span>
          </div>
        )}

        {/* Engineering AI Copilot Header Pill */}
        <Link
          to="/ai"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500/10 via-orange-500/15 to-amber-500/10 hover:from-amber-500/20 hover:to-orange-500/25 border border-amber-300 text-amber-900 text-xs font-bold transition-all shadow-2xs hover:shadow-xs group"
          title="Open Engineering AI Copilot Hub"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
          <span>AI Copilot</span>
          <span className="hidden md:inline-block px-1.5 py-0.2 rounded text-[9px] font-mono bg-amber-600 text-white font-semibold">
            Gemini
          </span>
        </Link>

        {/* Notifications Icon Button */}
        <Link
          to="/notifications"
          className="relative p-2 text-text-secondary hover:text-text-primary hover:bg-slate-100 rounded-full transition-colors"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-600 ring-2 ring-white" />
          )}
        </Link>

        {/* User Profile Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2.5 p-1 rounded-md hover:bg-slate-50 transition-colors focus:outline-none"
            aria-expanded={dropdownOpen}
          >
            <Avatar
              name={user?.full_name || user?.username || 'User'}
              src={user?.avatar_url}
              size="sm"
            />
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xs font-semibold text-text-primary leading-tight truncate max-w-[130px]">
                {user?.full_name || user?.username}
              </span>
              <span className="text-[10px] text-text-muted capitalize">
                {user?.role?.replace('_', ' ').toLowerCase()}
              </span>
            </div>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-border rounded-lg shadow-modal py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3.5 py-2 border-b border-border bg-slate-50/50 flex items-center gap-2.5">
                <Avatar
                  name={user?.full_name || user?.username || 'User'}
                  src={user?.avatar_url}
                  size="md"
                />
                <div className="flex flex-col min-w-0">
                  <p className="text-xs font-semibold text-text-primary truncate">
                    {user?.full_name}
                  </p>
                  <p className="text-[11px] text-text-muted truncate">{user?.email}</p>
                  <div className="mt-1">
                    <Badge variant="role" value={user?.role} size="sm" />
                  </div>
                </div>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    navigate('/settings');
                  }}
                  className="w-full text-left px-3.5 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-slate-50 flex items-center gap-2.5"
                >
                  <UserIcon className="w-3.5 h-3.5 text-text-muted" />
                  Profile Settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    navigate('/settings?tab=password');
                  }}
                  className="w-full text-left px-3.5 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-slate-50 flex items-center gap-2.5"
                >
                  <Key className="w-3.5 h-3.5 text-text-muted" />
                  Change Password
                </button>
              </div>

              <div className="border-t border-border pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    logout();
                    navigate('/login');
                  }}
                  className="w-full text-left px-3.5 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2.5 font-medium"
                >
                  <LogOut className="w-3.5 h-3.5 text-red-500" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
