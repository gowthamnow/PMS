import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Notification } from '../types';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { formatRelativeTime } from '../lib/utils';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  Clock,
  GitCommit,
  GitPullRequest,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  // Fetch notifications
  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.notifications.getNotifications(1, 50),
  });

  // Mark all read mutation
  const markAllReadMutation = useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('All notifications marked as read');
    },
  });

  // Mark single read mutation
  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const handleNotificationClick = async (notif: Notification) => {
    if (!notif.is_read) {
      await markReadMutation.mutateAsync(notif.id);
    }
    if (notif.related_task_id) {
      navigate(`/tasks/${notif.related_task_id}`);
    } else if (notif.related_project_id) {
      navigate(`/projects/${notif.related_project_id}`);
    }
  };

  const allNotifications = data?.items || [];
  const filteredNotifications =
    filter === 'unread' ? allNotifications.filter((n) => !n.is_read) : allNotifications;

  const unreadCount = allNotifications.filter((n) => !n.is_read).length;

  return (
    <div className="flex flex-col gap-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Notifications</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Real-time updates regarding task status changes, code commits, reviews, and mentions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<CheckCheck className="w-3.5 h-3.5" />}
              isLoading={markAllReadMutation.isPending}
              onClick={() => markAllReadMutation.mutate()}
            >
              Mark All as Read
            </Button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2 text-xs">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded font-medium transition-colors ${
            filter === 'all'
              ? 'bg-copper-50 text-copper-800 font-semibold border border-copper-200'
              : 'text-text-secondary hover:bg-slate-100'
          }`}
        >
          All ({allNotifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-3 py-1.5 rounded font-medium transition-colors ${
            filter === 'unread'
              ? 'bg-copper-50 text-copper-800 font-semibold border border-copper-200'
              : 'text-text-secondary hover:bg-slate-100'
          }`}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {/* Notification List */}
      <div className="bg-white border border-border rounded-lg shadow-card divide-y divide-border overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex items-center justify-center">
            <Spinner size="md" />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Bell className="w-6 h-6 text-slate-400" />}
              heading={filter === 'unread' ? 'No Unread Notifications' : 'No Notifications'}
              description="You're all caught up on engineering alerts."
            />
          </div>
        ) : (
          filteredNotifications.map((notif) => {
            let icon = <Bell className="w-4 h-4 text-copper-600" />;
            if (notif.type.includes('task')) icon = <CheckCircle2 className="w-4 h-4 text-blue-600" />;
            if (notif.type.includes('comment')) icon = <MessageSquare className="w-4 h-4 text-amber-600" />;
            if (notif.type.includes('git')) icon = <GitCommit className="w-4 h-4 text-copper-600" />;
            if (notif.type.includes('alert')) icon = <AlertTriangle className="w-4 h-4 text-red-600" />;

            return (
              <div
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={`p-4 flex items-start justify-between gap-4 cursor-pointer hover:bg-slate-50 transition-colors text-xs ${
                  !notif.is_read ? 'bg-amber-50/20' : ''
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-1.5 bg-slate-100 rounded mt-0.5 shrink-0">{icon}</div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <h4
                        className={`text-xs ${
                          !notif.is_read
                            ? 'font-bold text-text-primary'
                            : 'font-medium text-text-secondary'
                        }`}
                      >
                        {notif.title}
                      </h4>
                      {!notif.is_read && (
                        <span className="w-2 h-2 rounded-full bg-copper-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-text-secondary mt-0.5 leading-relaxed">{notif.body}</p>
                    <span className="text-[10px] text-text-muted mt-1 font-mono">
                      {formatRelativeTime(notif.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
