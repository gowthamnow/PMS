import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AuditLogEntry } from '../../types';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Table, Column } from '../../components/ui/Table';
import { Spinner } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/ErrorState';
import { formatDate, formatFileSize } from '../../lib/utils';
import {
  Server,
  HardDrive,
  Database,
  ShieldAlert,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';

export const SystemPage: React.FC = () => {
  const [logPage, setLogPage] = useState(1);

  // 1. Storage Quota
  const { data: quota, isLoading: isLoadingQuota } = useQuery({
    queryKey: ['attachments', 'quota'],
    queryFn: () => api.attachments.getQuota(),
  });

  // 2. System Info
  const {
    data: systemInfo,
    isLoading: isLoadingInfo,
    error,
    refetch,
  } = useQuery({
    queryKey: ['system', 'info'],
    queryFn: () => api.system.getInfo(),
  });

  // 3. Audit Logs
  const { data: auditLogsData, isLoading: isLoadingLogs } = useQuery({
    queryKey: ['system', 'audit-logs', { page: logPage }],
    queryFn: () => api.system.getAuditLogs(logPage, 15),
  });

  if (error) {
    return (
      <ErrorState
        title="Could not load system telemetry"
        message="Please check database connection."
        onRetry={refetch}
      />
    );
  }

  const logColumns: Column<AuditLogEntry>[] = [
    {
      key: 'created_at',
      header: 'Timestamp',
      className: 'font-mono text-text-muted',
      render: (log) => formatDate(log.created_at, 'yyyy-MM-dd HH:mm:ss'),
    },
    {
      key: 'user',
      header: 'Operator',
      render: (log) => (
        <span className="font-semibold text-text-primary">
          {log.user_name || 'System Daemon'}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (log) => (
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
          {log.action}
        </span>
      ),
    },
    {
      key: 'resource_type',
      header: 'Resource',
      render: (log) => (
        <span className="text-text-secondary capitalize">{log.resource_type}</span>
      ),
    },
    {
      key: 'details',
      header: 'Details',
      render: (log) => (
        <span className="text-text-muted text-[11px] font-mono truncate max-w-sm block">
          {log.details || '—'}
        </span>
      ),
    },
  ];

  const usedBytes = (quota as any)?.total_used_bytes ?? (quota as any)?.used_bytes ?? 0;
  const quotaBytes = (quota as any)?.total_quota_bytes ?? (quota as any)?.quota_bytes ?? 2 * 1024 * 1024 * 1024;
  const usedPercent = (quota as any)?.used_percentage ?? (quotaBytes > 0 ? Math.round((usedBytes / quotaBytes) * 100) : 0);

  const isDbHealthy = systemInfo?.database_status === 'healthy';


  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="pb-2 border-b border-border">
        <h1 className="text-xl font-bold text-text-primary tracking-tight">System &amp; Infrastructure</h1>
        <p className="text-xs text-text-secondary mt-0.5">
          Server health status, storage limits, and security audit log streams.
        </p>
      </div>

      {/* Storage and System Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Attachment Storage Quota */}
        <div className="bg-white p-5 rounded-lg border border-border shadow-card flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-copper-600" />
              <h3 className="text-sm font-bold text-text-primary">Attachment Storage</h3>
            </div>
            <span className="text-xs font-mono font-semibold text-text-secondary">
              2 GB Limit
            </span>
          </div>

          {isLoadingQuota ? (
            <div className="py-6 flex items-center justify-center">
              <Spinner size="md" />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-2xl font-bold font-mono text-text-primary">
                    {formatFileSize(usedBytes)}
                  </span>
                  <span className="text-xs text-text-muted ml-1.5">
                    of {formatFileSize(quotaBytes)} used
                  </span>
                </div>
                <span className="font-mono text-sm font-bold text-copper-700">
                  {usedPercent}%
                </span>
              </div>

              <ProgressBar
                value={usedPercent}
                size="md"
                showPercentage={false}
                variant={usedPercent > 85 ? 'amber' : 'copper'}
              />

              <div className="flex items-center justify-between text-xs text-text-muted pt-2 border-t border-slate-100">
                <span>Total Stored Files:</span>
                <span className="font-mono font-semibold text-text-primary">
                  {quota?.total_files || 0} files
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Card 2: System & Database Health */}
        <div className="bg-white p-5 rounded-lg border border-border shadow-card flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-copper-600" />
              <h3 className="text-sm font-bold text-text-primary">System Telemetry</h3>
            </div>
            <span className="text-xs font-mono text-text-muted">
              v{systemInfo?.version || '1.0.0'}
            </span>
          </div>

          <div className="flex flex-col gap-3 text-xs">
            {/* Database status */}
            <div className="flex items-center justify-between p-2.5 rounded bg-slate-50 border border-border">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-text-muted" />
                <span className="font-semibold text-text-primary">PostgreSQL Database</span>
              </div>
              <div className="flex items-center gap-1.5">
                {isDbHealthy ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
                <span
                  className={`font-semibold capitalize ${
                    isDbHealthy ? 'text-green-700' : 'text-red-700'
                  }`}
                >
                  {systemInfo?.database_status || 'healthy'}
                </span>
              </div>
            </div>

            {/* Environment */}
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="text-text-secondary">Environment</span>
              <span className="font-mono font-semibold text-text-primary uppercase">
                {systemInfo?.environment || 'Production'}
              </span>
            </div>

            {/* Platform Uptime */}
            <div className="flex items-center justify-between py-1">
              <span className="text-text-secondary flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-text-muted" />
                System Uptime
              </span>
              <span className="font-mono text-text-primary">
                {systemInfo?.uptime_seconds
                  ? `${Math.floor(systemInfo.uptime_seconds / 3600)}h ${Math.floor(
                      (systemInfo.uptime_seconds % 3600) / 60
                    )}m`
                  : 'Active'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-white border border-border rounded-lg shadow-card p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-copper-600" />
            <h3 className="text-sm font-bold text-text-primary">System Audit Trail</h3>
          </div>
        </div>

        <Table
          columns={logColumns}
          data={auditLogsData?.items || []}
          isLoading={isLoadingLogs}
          page={auditLogsData?.page || 1}
          totalPages={auditLogsData?.pages || 1}
          totalCount={auditLogsData?.total || 0}
          onPageChange={setLogPage}
          emptyMessage="No audit logs recorded yet."
        />
      </div>
    </div>
  );
};
