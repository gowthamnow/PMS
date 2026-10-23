import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { ProjectFolder, ProjectVaultFile, ProjectCopilotResponse } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Spinner } from '../ui/Spinner';
import { EmptyState } from '../ui/EmptyState';
import { formatDate, formatFileSize } from '../../lib/utils';
import {
  Folder,
  FolderPlus,
  FileText,
  Upload,
  Download,
  Trash2,
  ChevronRight,
  Sparkles,
  ArrowLeft,
  Search,
  Cpu,
  FileCode,
  Layers,
  FileArchive,
  HardDrive,
  Send,
  Bot,
  Lightbulb,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface ProjectVaultExplorerProps {
  projectId: string;
  projectName: string;
}

export const ProjectVaultExplorer: React.FC<ProjectVaultExplorerProps> = ({
  projectId,
  projectName,
}) => {
  const queryClient = useQueryClient();

  // Navigation states
  const [selectedFolder, setSelectedFolder] = useState<ProjectFolder | null>(null);
  const [fileSearch, setFileSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Modals
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDesc, setNewFolderDesc] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('blue');
  const [newFolderIcon, setNewFolderIcon] = useState('folder');

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [fileUploadCategory, setFileUploadCategory] = useState('datasheet');
  const [fileUploadDesc, setFileUploadDesc] = useState('');

  // AI Copilot Modal
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [copilotQuery, setCopilotQuery] = useState('');
  const [copilotCategory, setCopilotCategory] = useState('HARDWARE');
  const [copilotResponse, setCopilotResponse] = useState<ProjectCopilotResponse | null>(null);

  // 1. Fetch Folders
  const {
    data: folders = [],
    isLoading: isLoadingFolders,
  } = useQuery({
    queryKey: ['vault-folders', projectId],
    queryFn: () => api.vault.getFolders(projectId),
  });

  // 2. Fetch Files
  const {
    data: files = [],
    isLoading: isLoadingFiles,
  } = useQuery({
    queryKey: ['vault-files', projectId, selectedFolder?.id, fileSearch, categoryFilter],
    queryFn: () =>
      api.vault.getFiles(projectId, {
        folder_id: selectedFolder?.id,
        search: fileSearch || undefined,
        category: categoryFilter !== 'ALL' ? categoryFilter.toLowerCase() : undefined,
      }),
  });

  // 3. Fetch Vault Stats
  const { data: stats } = useQuery({
    queryKey: ['vault-stats', projectId],
    queryFn: () => api.vault.getStats(projectId),
  });

  // Create Folder Mutation
  const createFolderMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; color?: string; icon?: string }) =>
      api.vault.createFolder(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-folders', projectId] });
      queryClient.invalidateQueries({ queryKey: ['vault-stats', projectId] });
      setIsNewFolderModalOpen(false);
      setNewFolderName('');
      setNewFolderDesc('');
      toast.success('Folder created successfully');
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create folder'),
  });

  // Delete Folder Mutation
  const deleteFolderMutation = useMutation({
    mutationFn: (folderId: string) => api.vault.deleteFolder(projectId, folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-folders', projectId] });
      queryClient.invalidateQueries({ queryKey: ['vault-stats', projectId] });
      if (selectedFolder) setSelectedFolder(null);
      toast.success('Folder deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to delete folder'),
  });

  // Upload File Mutation
  const uploadFileMutation = useMutation({
    mutationFn: (f: File) =>
      api.vault.uploadFile(
        projectId,
        f,
        selectedFolder?.id,
        fileUploadCategory,
        fileUploadDesc || undefined
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-files', projectId] });
      queryClient.invalidateQueries({ queryKey: ['vault-folders', projectId] });
      queryClient.invalidateQueries({ queryKey: ['vault-stats', projectId] });
      setIsUploadModalOpen(false);
      setFileToUpload(null);
      setFileUploadDesc('');
      toast.success('File uploaded to vault successfully');
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to upload file'),
  });

  // Delete File Mutation
  const deleteFileMutation = useMutation({
    mutationFn: (fileId: string) => api.vault.deleteFile(fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-files', projectId] });
      queryClient.invalidateQueries({ queryKey: ['vault-folders', projectId] });
      queryClient.invalidateQueries({ queryKey: ['vault-stats', projectId] });
      toast.success('File removed from vault');
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to delete file'),
  });

  // AI Copilot Mutation
  const copilotMutation = useMutation({
    mutationFn: (problem: string) =>
      api.ai.consultProjectCopilot(projectId, problem, copilotCategory),
    onSuccess: (data) => {
      setCopilotResponse(data);
      toast.success('AI technical ideas & solutions generated!');
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.detail || 'Failed to generate AI ideas'),
  });

  const getFolderIcon = (iconName: string, color: string) => {
    const colorClasses: Record<string, string> = {
      blue: 'text-blue-600 bg-blue-50 border-blue-200',
      purple: 'text-purple-600 bg-purple-50 border-purple-200',
      emerald: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      amber: 'text-amber-600 bg-amber-50 border-amber-200',
      slate: 'text-slate-600 bg-slate-50 border-slate-200',
    };
    const cls = colorClasses[color] || colorClasses.blue;

    switch (iconName) {
      case 'datasheet':
        return <FileText className="w-5 h-5" />;
      case 'design':
        return <Layers className="w-5 h-5" />;
      case 'code':
        return <FileCode className="w-5 h-5" />;
      case 'extra':
        return <HardDrive className="w-5 h-5" />;
      default:
        return <Folder className="w-5 h-5" />;
    }
  };

  const getFileCategoryBadge = (cat: string) => {
    switch (cat.toLowerCase()) {
      case 'datasheet':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">Datasheet</span>;
      case 'design':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">Design / CAD</span>;
      case 'code':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Code / Firmware</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">Extra / Doc</span>;
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Vault Top Control Banner */}
      <div className="bg-white p-5 rounded-xl border border-border shadow-subtle flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-text-primary tracking-tight">
                Project File Management &amp; Schematics Vault
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                v2.1 AI Vault
              </span>
            </div>
            <p className="text-xs text-text-secondary mt-0.5">
              Organize component datasheets, Altium/KiCad schematics, firmware code, and test assets into structured folders.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Sparkles className="w-3.5 h-3.5 text-amber-500" />}
              onClick={() => {
                setIsCopilotOpen(true);
                setCopilotResponse(null);
              }}
            >
              Ask AI Project Copilot
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<FolderPlus className="w-3.5 h-3.5 text-copper-600" />}
              onClick={() => setIsNewFolderModalOpen(true)}
            >
              New Folder
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Upload className="w-3.5 h-3.5" />}
              onClick={() => {
                if (selectedFolder) {
                  setFileUploadCategory(selectedFolder.icon || 'extra');
                }
                setIsUploadModalOpen(true);
              }}
            >
              Upload Files
            </Button>
          </div>
        </div>

        {/* Aggregate Stats Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-col">
            <span className="text-[11px] text-text-muted">Total Vault Files</span>
            <span className="text-base font-bold text-text-primary mt-0.5">{stats?.total_files || files.length}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-col">
            <span className="text-[11px] text-text-muted">Vault Storage Used</span>
            <span className="text-base font-bold text-text-primary mt-0.5">{formatFileSize(stats?.total_bytes || 0)}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-col">
            <span className="text-[11px] text-text-muted">Folders Created</span>
            <span className="text-base font-bold text-text-primary mt-0.5">{folders.length}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-col">
            <span className="text-[11px] text-text-muted">AI Diagnostic Status</span>
            <span className="text-xs font-bold text-emerald-600 mt-1.5 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Active &amp; Ready
            </span>
          </div>
        </div>
      </div>

      {/* Breadcrumb Navigation & View Switcher */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setSelectedFolder(null)}
            className={`font-semibold transition-colors ${
              !selectedFolder ? 'text-copper-700' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            All Folders ({folders.length})
          </button>
          {selectedFolder && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
              <span className="font-semibold text-text-primary flex items-center gap-1">
                <span>📁</span>
                <span>{selectedFolder.name}</span>
              </span>
            </>
          )}
        </div>

        {selectedFolder && (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
            onClick={() => setSelectedFolder(null)}
          >
            Back to Folders
          </Button>
        )}
      </div>

      {/* ======================================================== */}
      {/* 1. FOLDERS GRID VIEW (When no folder is selected)         */}
      {/* ======================================================== */}
      {!selectedFolder && (
        <div className="flex flex-col gap-4">
          {isLoadingFolders ? (
            <div className="py-12 text-center"><Spinner size="md" /></div>
          ) : folders.length === 0 ? (
            <EmptyState
              heading="No Folders in Vault"
              description="Create folders like Datasheets, Design Files, Code, or Extra to organize your engineering deliverables."
              action={{
                label: "Create First Folder",
                onClick: () => setIsNewFolderModalOpen(true),
              }}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {folders.map((folder) => {
                const colorBgMap: Record<string, string> = {
                  blue: 'bg-blue-50/70 border-blue-200 hover:border-blue-300 text-blue-700',
                  purple: 'bg-purple-50/70 border-purple-200 hover:border-purple-300 text-purple-700',
                  emerald: 'bg-emerald-50/70 border-emerald-200 hover:border-emerald-300 text-emerald-700',
                  amber: 'bg-amber-50/70 border-amber-200 hover:border-amber-300 text-amber-700',
                  slate: 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-700',
                };
                const cardStyle = colorBgMap[folder.color] || colorBgMap.blue;

                return (
                  <div
                    key={folder.id}
                    onClick={() => setSelectedFolder(folder)}
                    className="p-4 rounded-xl bg-white border border-border hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between gap-3 relative"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className={`p-2.5 rounded-lg border ${cardStyle} transition-transform group-hover:scale-105`}>
                        {getFolderIcon(folder.icon, folder.color)}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete folder "${folder.name}" and all its contents?`)) {
                              deleteFolderMutation.mutate(folder.id);
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                          title="Delete folder"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-bold text-xs text-text-primary tracking-tight group-hover:text-copper-700 transition-colors">
                        {folder.name}
                      </h4>
                      <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2 leading-relaxed">
                        {folder.description || 'Engineering deliverables folder'}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-text-muted">
                      <span>{folder.file_count || 0} file(s)</span>
                      <span className="font-mono">{formatFileSize(folder.total_bytes || 0)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. FOLDER CONTENTS VIEW (Files inside selected folder)   */}
      {/* ======================================================== */}
      {selectedFolder && (
        <div className="bg-white p-5 rounded-xl border border-border shadow-subtle flex flex-col gap-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: 'ALL', label: 'All Files' },
                { id: 'DATASHEET', label: 'Datasheets' },
                { id: 'DESIGN', label: 'Design / CAD' },
                { id: 'CODE', label: 'Code & Binaries' },
                { id: 'EXTRA', label: 'Extra Docs' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    categoryFilter === cat.id
                      ? 'bg-copper-100 text-copper-800 border-copper-300 font-semibold'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="w-48">
              <Input
                placeholder="Search files..."
                value={fileSearch}
                onChange={(e) => setFileSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Files List */}
          {isLoadingFiles ? (
            <div className="py-12 text-center"><Spinner size="md" /></div>
          ) : files.length === 0 ? (
            <EmptyState
              heading={`No files in ${selectedFolder.name}`}
              description="Upload datasheets, schematics, Gerber archives, or source binaries to this folder."
              action={{
                label: "Upload First File",
                onClick: () => {
                  setFileUploadCategory(selectedFolder.icon || 'extra');
                  setIsUploadModalOpen(true);
                },
              }}
            />
          ) : (
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden text-xs">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className="p-2 rounded-lg bg-slate-100 text-slate-700 shrink-0">
                      <FileText className="w-4 h-4 text-copper-600" />
                    </div>
                    <div className="truncate flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-text-primary truncate">
                          {file.filename}
                        </span>
                        {getFileCategoryBadge(file.category)}
                      </div>
                      <span className="text-[11px] text-text-muted mt-0.5">
                        {file.description ? `${file.description} • ` : ''}
                        Uploaded {formatDate(file.created_at)} by {file.uploader?.full_name || 'Engineer'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 justify-end">
                    <span className="font-mono text-text-muted text-[11px] mr-2">
                      {formatFileSize(file.file_size)}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<Download className="w-3.5 h-3.5" />}
                      onClick={() => api.vault.downloadFile(file.id, file.filename)}
                    >
                      Download
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Sparkles className="w-3.5 h-3.5 text-amber-500" />}
                      onClick={() => {
                        setIsCopilotOpen(true);
                        setCopilotQuery(`Analyze technical file '${file.filename}' (${file.category}) in project '${projectName}'. How does it integrate with our hardware/firmware deliverables and what potential roadblocks should we check?`);
                      }}
                      title="Ask AI to analyze this file"
                    >
                      Ask AI
                    </Button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete file "${file.filename}"?`)) {
                          deleteFileMutation.mutate(file.id);
                        }
                      }}
                      className="p-1.5 text-text-muted hover:text-red-600 rounded transition-colors"
                      title="Delete file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CREATE NEW FOLDER                                  */}
      {/* ======================================================== */}
      <Modal
        isOpen={isNewFolderModalOpen}
        onClose={() => setIsNewFolderModalOpen(false)}
        title="Create New Vault Folder"
      >
        <div className="flex flex-col gap-4 text-xs">
          <div>
            <label className="block text-text-primary font-semibold mb-1">
              Folder Name <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="e.g. PCB Schematics, Test Waveforms, Drivers..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-text-primary font-semibold mb-1">
              Description (Optional)
            </label>
            <textarea
              className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-white focus:ring-1 focus:ring-copper-500"
              rows={2}
              placeholder="Describe deliverables and file types in this folder..."
              value={newFolderDesc}
              onChange={(e) => setNewFolderDesc(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-text-primary font-semibold mb-1">Color Theme</label>
              <select
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-white"
                value={newFolderColor}
                onChange={(e) => setNewFolderColor(e.target.value)}
              >
                <option value="blue">🔵 Blue (Datasheets)</option>
                <option value="purple">🟣 Purple (Design / CAD)</option>
                <option value="emerald">🟢 Emerald (Code &amp; Firmware)</option>
                <option value="amber">🟠 Amber (Extra &amp; Docs)</option>
                <option value="slate">⚪ Slate (General)</option>
              </select>
            </div>
            <div>
              <label className="block text-text-primary font-semibold mb-1">Folder Category</label>
              <select
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-white"
                value={newFolderIcon}
                onChange={(e) => setNewFolderIcon(e.target.value)}
              >
                <option value="datasheet">Datasheet Specs</option>
                <option value="design">Schematics &amp; Design</option>
                <option value="code">Firmware Code</option>
                <option value="extra">Extra / Notes</option>
                <option value="folder">Generic Folder</option>
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-border flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setIsNewFolderModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
              isLoading={createFolderMutation.isPending}
              onClick={() =>
                createFolderMutation.mutate({
                  name: newFolderName,
                  description: newFolderDesc || undefined,
                  color: newFolderColor,
                  icon: newFolderIcon,
                })
              }
            >
              Create Folder
            </Button>
          </div>
        </div>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL: UPLOAD FILE TO VAULT                               */}
      {/* ======================================================== */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        title={selectedFolder ? `Upload to ${selectedFolder.name}` : 'Upload File to Vault'}
      >
        <div className="flex flex-col gap-4 text-xs">
          <div className="p-6 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 flex flex-col items-center justify-center text-center">
            <Upload className="w-8 h-8 text-slate-400 mb-2" />
            <input
              type="file"
              id="vault-file-input"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setFileToUpload(e.target.files[0]);
                }
              }}
            />
            {fileToUpload ? (
              <div className="flex flex-col items-center">
                <span className="font-bold text-copper-800 text-xs">{fileToUpload.name}</span>
                <span className="text-[11px] text-text-muted mt-0.5">{formatFileSize(fileToUpload.size)}</span>
                <button
                  onClick={() => setFileToUpload(null)}
                  className="mt-2 text-xs text-red-600 hover:underline"
                >
                  Choose another file
                </button>
              </div>
            ) : (
              <label
                htmlFor="vault-file-input"
                className="cursor-pointer px-3 py-1.5 rounded-lg bg-copper-600 hover:bg-copper-700 text-white font-medium text-xs shadow-xs"
              >
                Browse File from Disk
              </label>
            )}
            <span className="text-[10px] text-slate-400 mt-2">
              Max size 25MB &bull; Supports PDF, CAD, Gerber ZIP, HEX/BIN, C/C++ sources
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-text-primary font-semibold mb-1">Category</label>
              <select
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-white"
                value={fileUploadCategory}
                onChange={(e) => setFileUploadCategory(e.target.value)}
              >
                <option value="datasheet">Datasheet Specs</option>
                <option value="design">Schematics / CAD</option>
                <option value="code">Code / Firmware</option>
                <option value="extra">Extra / Documentation</option>
              </select>
            </div>
            <div>
              <label className="block text-text-primary font-semibold mb-1">Target Folder</label>
              <select
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-white"
                value={selectedFolder?.id || ''}
                onChange={(e) => {
                  const target = folders.find((f) => f.id === e.target.value) || null;
                  setSelectedFolder(target);
                }}
              >
                <option value="">(Root Vault)</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    📁 {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-text-primary font-semibold mb-1">
              Revision / Technical Note
            </label>
            <Input
              placeholder="e.g. Rev 2.1 with bypass capacitors added..."
              value={fileUploadDesc}
              onChange={(e) => setFileUploadDesc(e.target.value)}
            />
          </div>

          <div className="pt-3 border-t border-border flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setIsUploadModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!fileToUpload || uploadFileMutation.isPending}
              isLoading={uploadFileMutation.isPending}
              onClick={() => fileToUpload && uploadFileMutation.mutate(fileToUpload)}
            >
              Upload to Vault
            </Button>
          </div>
        </div>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL: AI PROJECT COPILOT & PROBLEM SOLVER               */}
      {/* ======================================================== */}
      <Modal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        title={`AI Project Copilot & Problem Solver • ${projectName}`}
        size="xl"
      >
        <div className="flex flex-col gap-4 text-xs text-text-primary">
          <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl flex items-center gap-3">
            <div className="p-2 bg-amber-500 text-white rounded-lg shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-amber-950 block text-xs">
                Engineering Roadblock &amp; Problem Solver
              </span>
              <span className="text-[11px] text-amber-800">
                Describe any schematic roadblock, firmware error, or component inquiry. AI inspects project files and tasks to propose solutions.
              </span>
            </div>
          </div>

          {/* Input Area */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-text-secondary text-[11px] uppercase tracking-wider">
                Describe the Roadblock or Technical Challenge:
              </label>
              <select
                className="px-2.5 py-1 text-[11px] rounded border border-border bg-white"
                value={copilotCategory}
                onChange={(e) => setCopilotCategory(e.target.value)}
              >
                <option value="HARDWARE">Hardware &amp; Circuit Schematics</option>
                <option value="FIRMWARE">Firmware &amp; Microcontroller</option>
                <option value="BUG">Software Bug / Error</option>
                <option value="ARCHITECTURE">System Architecture</option>
              </select>
            </div>
            <textarea
              className="w-full px-3 py-2.5 text-xs rounded-lg border border-border bg-white focus:ring-1 focus:ring-amber-500"
              rows={3}
              placeholder="e.g. The Traveo MCU SPI bus fails to communicate with the energy meter IC at 4MHz clock rate. What could be the hardware or timing cause?"
              value={copilotQuery}
              onChange={(e) => setCopilotQuery(e.target.value)}
            />
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                disabled={!copilotQuery.trim() || copilotMutation.isPending}
                isLoading={copilotMutation.isPending}
                onClick={() => copilotMutation.mutate(copilotQuery)}
              >
                Consult AI Copilot
              </Button>
            </div>
          </div>

          {/* Loading State */}
          {copilotMutation.isPending && (
            <div className="py-8 flex flex-col items-center justify-center gap-2">
              <Spinner size="md" />
              <span className="text-xs font-semibold text-text-primary">
                Analyzing Project Vault &amp; Formulating Technical Solution...
              </span>
            </div>
          )}

          {/* AI Response Display */}
          {copilotResponse && (
            <div className="p-4 rounded-xl border border-border bg-slate-50/80 max-h-[50vh] overflow-y-auto flex flex-col gap-3">
              <div className="flex items-center justify-between text-[11px] text-text-muted pb-2 border-b border-border">
                <span className="font-bold text-copper-800 flex items-center gap-1.5">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  AI Engineering Recommendation
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  Engine: {copilotResponse.ai_provider}
                </span>
              </div>

              <div className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap">
                {copilotResponse.formatted_markdown}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(copilotResponse.formatted_markdown);
                    toast.success('Recommendation copied to clipboard');
                  }}
                >
                  Copy Advice
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                  onClick={() => {
                    toast.success('Suggested task recorded for sprint planning');
                    setIsCopilotOpen(false);
                  }}
                >
                  Apply Recommendation
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
