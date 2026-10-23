import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { cn } from '../../lib/utils';
import {
  LayoutDashboard,
  FolderOpen,
  CheckSquare,
  MessageSquare,
  Users,
  Clock,
  BarChart2,
  Bell,
  Settings,
  UserCog,
  Settings2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Logo } from '../ui/Logo';

export interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, onToggleCollapse }) => {
  const { user } = useAuth();
  const location = useLocation();

  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.notifications.getUnreadCount(),
    refetchInterval: 30000,
  });

  const unreadCount = unreadData?.count || 0;

  const mainNavItems = [
    { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
    { label: 'Projects', icon: FolderOpen, href: '/projects' },
    { label: 'Tasks', icon: CheckSquare, href: '/tasks' },
    {
      label: 'AI Copilot',
      icon: Sparkles,
      href: '/ai',
      badgeText: 'AI',
    },
    { label: 'Messages', icon: MessageSquare, href: '/messages' },
    { label: 'Team', icon: Users, href: '/team' },
    { label: 'Timesheet', icon: Clock, href: '/timesheet' },
    { label: 'Reports', icon: BarChart2, href: '/reports' },
    {
      label: 'Notifications',
      icon: Bell,
      href: '/notifications',
      badge: unreadCount > 0 ? unreadCount : undefined,
    },
  ];

  const adminNavItems = [
    { label: 'Users', icon: UserCog, href: '/admin/users' },
    { label: 'System', icon: Settings2, href: '/admin/system' },
  ];

  return (
    <aside
      className={cn(
        'fixed top-0 left-0 bottom-0 z-30 bg-white border-r border-border transition-all duration-300 flex flex-col',
        isCollapsed ? 'w-[64px]' : 'w-[240px]'
      )}
    >
      {/* Brand Header with Attractive Hardware Vector Logo */}
      <div className="h-[60px] border-b border-border flex items-center px-3.5 justify-between bg-slate-50/50 overflow-hidden">
        <Logo size="sm" showText={!isCollapsed} />
      </div>

      {/* Navigation Body */}
      <div className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-1">
        {/* Main Nav */}
        <div className="flex flex-col gap-0.5">
          {!isCollapsed && (
            <div className="px-2.5 py-1.5 mb-1.5 bg-slate-50 border border-slate-200/80 rounded-md flex items-center justify-between">
              <div className="flex items-center gap-1.5 overflow-hidden">
                <span className="text-xs">🏢</span>
                <span
                  className="text-[11px] font-semibold text-slate-800 truncate max-w-[125px]"
                  title={user?.workspace_name || (user?.role === 'ADMIN' ? 'All Workspaces (Admin)' : 'Engineering Workspace')}
                >
                  {user?.workspace_name || (user?.role === 'ADMIN' ? 'All Workspaces' : 'Engineering Workspace')}
                </span>
              </div>
              {user?.role === 'ADMIN' && (
                <NavLink
                  to="/admin/users?tab=workspaces"
                  className="text-[10px] text-copper-600 hover:text-copper-700 font-semibold hover:underline shrink-0"
                  title="Switch workspace"
                >
                  Switch
                </NavLink>
              )}
            </div>
          )}
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.href ||
              (item.href !== '/dashboard' && location.pathname.startsWith(item.href));

            return (
              <NavLink
                key={item.href}
                to={item.href}
                title={isCollapsed ? item.label : undefined}
                className={cn(
                  'flex items-center gap-3 px-2.5 py-2 rounded-[5px] text-xs font-medium transition-colors group relative',
                  isActive
                    ? 'bg-copper-50 text-copper-800 border-l-[3px] border-copper-600 font-semibold pl-[9px]'
                    : 'text-text-secondary hover:bg-slate-100 hover:text-text-primary'
                )}
              >
                <Icon
                  className={cn(
                    'w-4 h-4 shrink-0 transition-colors',
                    isActive ? 'text-copper-700' : 'text-text-muted group-hover:text-text-secondary'
                  )}
                />
                {!isCollapsed && <span className="truncate flex-1">{item.label}</span>}
                {'badgeText' in item && item.badgeText && !isCollapsed && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white tracking-wider">
                    {item.badgeText}
                  </span>
                )}
                {item.badge !== undefined && (
                  <span
                    className={cn(
                      'font-mono text-[10px] font-bold px-1.5 py-0.2 rounded-full',
                      isCollapsed
                        ? 'absolute top-1 right-1 w-2 h-2 p-0 bg-red-600'
                        : 'bg-red-500 text-white'
                    )}
                  >
                    {!isCollapsed && item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>

        {/* Admin Nav */}
        {user?.role === 'ADMIN' && (
          <div className="flex flex-col gap-0.5 mt-3 pt-3 border-t border-border">
            {!isCollapsed && (
              <span className="px-2.5 py-1 text-[10px] font-semibold tracking-wider text-text-muted uppercase">
                Administration
              </span>
            )}
            {adminNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.href);

              return (
                <NavLink
                  key={item.href}
                  to={item.href}
                  title={isCollapsed ? item.label : undefined}
                  className={cn(
                    'flex items-center gap-3 px-2.5 py-2 rounded-[5px] text-xs font-medium transition-colors group relative',
                    isActive
                      ? 'bg-copper-50 text-copper-800 border-l-[3px] border-copper-600 font-semibold pl-[9px]'
                      : 'text-text-secondary hover:bg-slate-100 hover:text-text-primary'
                  )}
                >
                  <Icon
                    className={cn(
                      'w-4 h-4 shrink-0 transition-colors',
                      isActive ? 'text-copper-700' : 'text-text-muted group-hover:text-text-secondary'
                    )}
                  />
                  {!isCollapsed && <span className="truncate flex-1">{item.label}</span>}
                </NavLink>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer / Settings & Collapse Button */}
      <div className="p-2 border-t border-border flex flex-col gap-1 bg-slate-50/40">
        <NavLink
          to="/settings"
          title={isCollapsed ? 'Settings' : undefined}
          className={cn(
            'flex items-center gap-3 px-2.5 py-2 rounded-[5px] text-xs font-medium transition-colors text-text-secondary hover:bg-slate-100 hover:text-text-primary',
            location.pathname === '/settings' &&
              'bg-copper-50 text-copper-800 border-l-[3px] border-copper-600 pl-[9px] font-semibold'
          )}
        >
          <Settings className="w-4 h-4 text-text-muted shrink-0" />
          {!isCollapsed && <span>Settings</span>}
        </NavLink>

        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center justify-center p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-slate-100 transition-colors mt-1"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <div className="flex items-center gap-2 text-xs text-text-secondary w-full px-1">
              <ChevronLeft className="w-4 h-4 text-text-muted" />
              <span>Collapse Sidebar</span>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
};
