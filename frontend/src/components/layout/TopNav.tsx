import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Bell, ChevronRight, LogOut, User as UserIcon, Key } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface TopNavProps {
  isSidebarCollapsed: boolean;
}

export const TopNav: React.FC<TopNavProps> = ({ isSidebarCollapsed }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.notifications.getUnreadCount(),
    refetchInterval: 30000,
  });

  const unreadCount = unreadData?.count || 0;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        {/* Workspace Pill */}
        {user?.role === 'ADMIN' ? (
          <Link
            to="/admin/users?tab=workspaces"
            className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-medium text-slate-700 transition-colors shadow-2xs"
            title="Workspaces Management"
          >
            <span className="text-copper-600 font-bold">🏢</span>
            <span>{user?.workspace_name || 'All Workspaces (Admin)'}</span>
            <span className="text-[10px] text-slate-400 font-normal">Switch</span>
          </Link>
        ) : (
          <div
            className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700"
            title="Your assigned workspace"
          >
            <span className="text-copper-600 font-bold">🏢</span>
            <span className="font-semibold text-slate-900">{user?.workspace_name || 'Engineering Workspace'}</span>
          </div>
        )}

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
