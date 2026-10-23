import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AuditLogEntry, BackupStatus } from '../../types';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Table, Column } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
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
  GitBranch,
  GitCommit,
  Download,
  RotateCcw,
  Sparkles,
  Key,
  Bot,
} from 'lucide-react';
import toast from 'react-hot-toast';

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

  const queryClient = useQueryClient();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isUpdatingAI, setIsUpdatingAI] = useState(false);

  // 4. Backup Status
  const { data: backupStatus } = useQuery({
    queryKey: ['system', 'backup-status'],
    queryFn: () => api.backup.getStatus(),
  });

  // 5. AI Config
  const { data: aiConfig } = useQuery({
    queryKey: ['system', 'ai-config'],
    queryFn: () => api.ai.getConfig(),
  });

  const triggerBackupMutation = useMutation({
    mutationFn: () => api.backup.createBackup(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['system', 'backup-status'] });
      toast.success(data.message || 'Database snapshot created!');
    },
    onError: () => toast.error('Failed to trigger backup snapshot'),
  });

  const updateAIMutation = useMutation({
    mutationFn: (key: string) => api.ai.updateConfig(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system', 'ai-config'] });
      toast.success('Google Gemini API key updated!');
      setApiKeyInput('');
      setIsUpdatingAI(false);
    },
    onError: () => toast.error('Failed to update Gemini API key'),
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

      {/* Git Backup & Google Gemini AI Integration Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Git & Instant Database Restore */}
        <div className="bg-white border border-border rounded-lg shadow-card p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-copper-600" />
                <h3 className="text-sm font-bold text-text-primary">Git Version &amp; Instant Restore</h3>
              </div>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-copper-50 text-copper-800 border border-copper-200 font-semibold">
                {backupStatus?.git_branch || 'main'}
              </span>
            </div>

            <div className="flex flex-col gap-2.5 text-xs pt-1">
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-text-muted flex items-center gap-1.5">
                  <GitCommit className="w-3.5 h-3.5 text-slate-400" />
                  Latest Commit
                </span>
                <span className="font-mono text-text-primary truncate max-w-[200px]" title={backupStatus?.git_commit}>
                  {backupStatus?.git_commit || 'Synchronized'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-text-muted flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-slate-400" />
                  Latest DB Snapshot
                </span>
                <span className="font-mono text-emerald-700 font-medium">
                  {backupStatus?.latest_db_snapshot_size ? `${backupStatus.latest_db_snapshot_size} (${backupStatus.latest_db_snapshot_time})` : 'Pending creation'}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Instant Terminal Restore Command:
                </span>
                <code className="text-[11px] font-mono text-slate-800 select-all bg-white px-2 py-1 rounded border border-slate-200">
                  {backupStatus?.restore_command || 'sudo ./scripts/restore.sh'}
                </code>
              </div>
            </div>
          </div>

          <div className="pt-2 flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              isLoading={triggerBackupMutation.isPending}
              onClick={() => triggerBackupMutation.mutate()}
            >
              Trigger Instant Snapshot
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Download className="w-3.5 h-3.5" />}
              onClick={() => api.backup.downloadSnapshot()}
            >
              Download Snapshot (.sql.gz)
            </Button>
          </div>
        </div>

        {/* Card 2: Google Gemini AI & Cloud Generative Config */}
        <div className="bg-white border border-border rounded-lg shadow-card p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-bold text-text-primary">Google Gemini Cloud AI</h3>
              </div>
              <span className={`font-mono text-[11px] px-2 py-0.5 rounded font-semibold border ${
                aiConfig?.has_api_key
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {aiConfig?.has_api_key ? '● Cloud Live' : '● Rule Engine Active'}
              </span>
            </div>

            <div className="flex flex-col gap-2 text-xs pt-1">
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-text-muted">Target Model</span>
                <span className="font-mono font-semibold text-text-primary">
                  {aiConfig?.model || 'gemini-1.5-flash'}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-text-muted text-[11px]">Active Generative Capabilities:</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <span className="px-2 py-1 rounded bg-slate-50 border border-slate-200 text-[10px] text-slate-700 font-medium flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                    Task Bug Auto-Solver
                  </span>
                  <span className="px-2 py-1 rounded bg-slate-50 border border-slate-200 text-[10px] text-slate-700 font-medium flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                    Project AI Copilot
                  </span>
                  <span className="px-2 py-1 rounded bg-slate-50 border border-slate-200 text-[10px] text-slate-700 font-medium flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                    Datasheet Analyzer
                  </span>
                  <span className="px-2 py-1 rounded bg-slate-50 border border-slate-200 text-[10px] text-slate-700 font-medium flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                    1-Click Auto-Post Fix
                  </span>
                </div>
              </div>

              {isUpdatingAI ? (
                <div className="flex flex-col gap-1.5 pt-2">
                  <label className="text-[11px] font-semibold text-text-secondary">
                    Enter Google Gemini API Key:
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="password"
                      placeholder="AIzaSy..."
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!apiKeyInput.trim() || updateAIMutation.isPending}
                      isLoading={updateAIMutation.isPending}
                      onClick={() => updateAIMutation.mutate(apiKeyInput)}
                    >
                      Save Key
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setIsUpdatingAI(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <span className="text-[11px] text-text-muted">
              {aiConfig?.has_api_key ? 'API key stored & encrypted' : 'Using PMS built-in expert diagnostics'}
            </span>
            {!isUpdatingAI && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Key className="w-3.5 h-3.5 text-copper-600" />}
                onClick={() => setIsUpdatingAI(true)}
              >
                {aiConfig?.has_api_key ? 'Update Gemini Key' : 'Configure Gemini Key'}
              </Button>
            )}
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
