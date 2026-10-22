import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Project } from '../../types';
import { Badge } from '../ui/Badge';
import { ProgressBar } from '../ui/ProgressBar';
import { Avatar } from '../ui/Avatar';
import { formatDate } from '../../lib/utils';
import { api } from '../../lib/api';
import {
  Calendar,
  CheckCircle2,
  ArrowUpRight,
  Camera,
  Image as ImageIcon,
  Upload,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ProjectCard3DProps {
  project: Project;
  onDelete?: (project: Project) => void;
}

const getStatusAccent = (status: string) => {
  switch (status) {
    case 'ACTIVE':
      return {
        topBorder: 'border-t-emerald-500',
        badgeBg: 'bg-emerald-500',
        textColor: 'text-emerald-700',
      };
    case 'PLANNING':
      return {
        topBorder: 'border-t-amber-500',
        badgeBg: 'bg-amber-500',
        textColor: 'text-amber-700',
      };
    case 'ON_HOLD':
      return {
        topBorder: 'border-t-orange-500',
        badgeBg: 'bg-orange-500',
        textColor: 'text-orange-700',
      };
    case 'COMPLETED':
      return {
        topBorder: 'border-t-blue-500',
        badgeBg: 'bg-blue-500',
        textColor: 'text-blue-700',
      };
    default:
      return {
        topBorder: 'border-t-slate-400',
        badgeBg: 'bg-slate-400',
        textColor: 'text-slate-600',
      };
  }
};

export const ProjectCard3D: React.FC<ProjectCard3DProps> = ({ project, onDelete }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [cardStyle, setCardStyle] = useState<'3d' | 'flat'>(() => {
    return (localStorage.getItem('pms_card_style') as '3d' | 'flat') || '3d';
  });

  useEffect(() => {
    const handleStyleChange = () => {
      setCardStyle((localStorage.getItem('pms_card_style') as '3d' | 'flat') || '3d');
    };
    window.addEventListener('pms_style_change', handleStyleChange);
    return () => window.removeEventListener('pms_style_change', handleStyleChange);
  }, []);

  const accent = getStatusAccent(project.status);

  const total = project.task_count || 0;
  const done = project.completed_task_count || 0;
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Project image must be under 10MB.');
      return;
    }

    try {
      setIsUploading(true);
      await api.projects.uploadProjectImage(project.id, file);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project cover image updated!');
    } catch {
      toast.error('Failed to update project image.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div
      onClick={() => navigate(`/projects/${project.id}`)}
      className={`group relative flex flex-col justify-between rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden min-h-[320px] ${
        cardStyle === '3d'
          ? `bg-white border-slate-200 border-t-[4px] ${accent.topBorder} shadow-xs hover:shadow-lg hover:border-slate-300 hover:-translate-y-0.5`
          : 'bg-white border-slate-200 shadow-none hover:border-slate-400'
      }`}
    >
      {/* Hidden image input for fixing/uploading project picture */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Top Space for Project Image / Schematic Preview */}
      <div className="relative w-full h-32 bg-slate-900 overflow-hidden group/img">
        {project.image_url ? (
          <img
            src={project.image_url}
            alt={project.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-copper-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Tech grid background */}
            <div
              className="absolute inset-0 opacity-15"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)',
                backgroundSize: '16px 16px',
              }}
            />
            <div className="relative z-10 flex flex-col items-center gap-1.5 text-center">
              <span className="p-2 rounded-full bg-white/10 backdrop-blur-xs text-copper-400 border border-white/10">
                <ImageIcon className="w-4 h-4" />
              </span>
              <span className="text-[10px] font-mono text-slate-300 tracking-wider uppercase font-semibold">
                Schematic / Hardware Vault
              </span>
            </div>
          </div>
        )}

        {/* Floating Upload / Fix Image Button */}
        <button
          type="button"
          onClick={handleImageClick}
          disabled={isUploading}
          title="Fix or upload project image"
          className="absolute bottom-2 right-2 px-2.5 py-1 rounded-md bg-black/60 hover:bg-black/80 backdrop-blur-md text-white text-[10px] font-medium flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-all border border-white/20 shadow-sm"
        >
          <Camera className="w-3 h-3 text-copper-300" />
          <span>{isUploading ? 'Saving...' : project.image_url ? 'Change Image' : 'Fix Image'}</span>
        </button>

        {/* Overlay Badges */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <Badge variant="project" value={project.status} size="sm" />
          <Badge variant="priority" value={project.priority} size="sm" />
        </div>

        {/* Actions Top Right */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(project);
              }}
              className="w-6 h-6 rounded-full bg-white/80 backdrop-blur-md flex items-center justify-center text-slate-500 hover:bg-red-600 hover:text-white transition-colors shadow-xs"
              title="Delete Project"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
          <div className="w-6 h-6 rounded-full bg-white/80 backdrop-blur-md flex items-center justify-center text-slate-700 group-hover:bg-copper-600 group-hover:text-white transition-colors shadow-xs">
            <ArrowUpRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Main Card Content */}
      <div className="p-4 flex flex-col flex-1 justify-between gap-3">
        {/* Title & Description */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 group-hover:text-copper-700 transition-colors line-clamp-1 leading-snug">
              {project.name}
            </h3>
            {project.workspace_name && (
              <span className="shrink-0 text-[10px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                🏢 {project.workspace_name}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
            {project.description || project.objectives || 'Engineering project deliverable.'}
          </p>
        </div>

        {/* Sprint Progress Section */}
        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-600 flex items-center gap-1 text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Sprint Progress</span>
            </span>
            <span className="font-mono font-bold text-slate-800 text-xs">
              {progressPct}%
            </span>
          </div>
          <ProgressBar value={progressPct} size="sm" showPercentage={false} />
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
            <span>{done} completed</span>
            <span>{total} total tasks</span>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-1 text-slate-500">
            <Calendar className="w-3 h-3" />
            <span className="text-[11px]">
              {project.target_date ? formatDate(project.target_date, 'MMM d, yyyy') : 'No target date'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-slate-500">
              {project.member_count || 1} {project.member_count === 1 ? 'member' : 'members'}
            </span>
            <Avatar name={project.name} size="xs" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectCard3D;
