import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Project } from '../../types';
import { Badge } from '../ui/Badge';
import { ProgressBar } from '../ui/ProgressBar';
import { Avatar } from '../ui/Avatar';
import { formatDate } from '../../lib/utils';
import {
  Cpu,
  Layers,
  Calendar,
  Users,
  CheckCircle2,
  ArrowUpRight,
} from 'lucide-react';

interface ProjectCard3DProps {
  project: Project;
}

const getProjectTheme = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('meter') || lower.includes('power') || lower.includes('energy')) {
    return {
      gradient: 'from-amber-500/20 via-orange-500/10 to-transparent',
      badgeBg: 'bg-amber-100 text-amber-800 border-amber-300',
      iconColor: 'text-amber-600',
      circuitColor: '#D97706',
      tag: 'Hardware & Power',
    };
  }
  if (lower.includes('firmware') || lower.includes('embedded') || lower.includes('driver')) {
    return {
      gradient: 'from-blue-500/20 via-cyan-500/10 to-transparent',
      badgeBg: 'bg-blue-100 text-blue-800 border-blue-300',
      iconColor: 'text-blue-600',
      circuitColor: '#2563EB',
      tag: 'Firmware Core',
    };
  }
  if (lower.includes('pcb') || lower.includes('schematic') || lower.includes('board')) {
    return {
      gradient: 'from-emerald-500/20 via-teal-500/10 to-transparent',
      badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      iconColor: 'text-emerald-600',
      circuitColor: '#059669',
      tag: 'PCB & Schematics',
    };
  }
  return {
    gradient: 'from-slate-500/20 via-indigo-500/10 to-transparent',
    badgeBg: 'bg-slate-100 text-slate-800 border-slate-300',
    iconColor: 'text-indigo-600',
    circuitColor: '#4F46E5',
    tag: 'Engineering Initiative',
  };
};

export const ProjectCard3D: React.FC<ProjectCard3DProps> = ({ project }) => {
  const navigate = useNavigate();
  const theme = getProjectTheme(project.name);

  const total = project.task_count || 0;
  const done = project.completed_task_count || 0;
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      onClick={() => navigate(`/projects/${project.id}`)}
      className="group relative flex flex-col justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-2xl hover:-translate-y-2 hover:border-amber-400/80 transition-all duration-300 overflow-hidden cursor-pointer p-5 min-h-[300px]"
    >
      {/* Top Ambient Gradient Layer */}
      <div
        className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-b ${theme.gradient} opacity-80 group-hover:opacity-100 transition-opacity pointer-events-none`}
      />

      {/* Decorative Hardware Microcircuit Graphic */}
      <div className="absolute top-3 right-3 opacity-15 group-hover:opacity-30 transition-opacity pointer-events-none">
        <svg width="68" height="68" viewBox="0 0 100 100" fill="none">
          <circle cx="50" cy="50" r="38" stroke={theme.circuitColor} strokeWidth="2" strokeDasharray="4 4" />
          <path d="M50 20 V35 M50 65 V80 M20 50 H35 M65 50 H80" stroke={theme.circuitColor} strokeWidth="3" />
          <rect x="42" y="42" width="16" height="16" rx="3" fill={theme.circuitColor} />
        </svg>
      </div>

      {/* Header Section */}
      <div className="relative z-10 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase border bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm text-text-secondary border-slate-200 shadow-2xs">
            <Cpu className={`w-3 h-3 ${theme.iconColor}`} />
            <span>{theme.tag}</span>
          </span>

          <div className="flex items-center gap-1.5">
            <Badge variant="project" value={project.status} size="sm" />
            <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-text-muted group-hover:bg-amber-500 group-hover:text-white transition-colors">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Project Title */}
        <div className="mt-1">
          <h3 className="text-base font-bold text-text-primary group-hover:text-amber-600 transition-colors line-clamp-2 leading-snug">
            {project.name}
          </h3>
          <p className="text-xs text-text-muted mt-1 line-clamp-2 leading-relaxed">
            {project.description || project.objectives || 'Engineering project initiative.'}
          </p>
        </div>
      </div>

      {/* Center 3D Project Metrics Tile */}
      <div className="relative z-10 my-3 p-3 rounded-xl bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 flex flex-col gap-2 shadow-2xs backdrop-blur-xs">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-text-secondary flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Sprint Progress</span>
          </span>
          <span className="font-mono font-bold text-text-primary text-xs">
            {progressPct}%
          </span>
        </div>
        <ProgressBar value={progressPct} size="sm" showPercentage={false} />
        <div className="flex items-center justify-between text-[11px] font-mono text-text-muted">
          <span>{done} completed</span>
          <span>{total} total tasks</span>
        </div>
      </div>

      {/* Footer Section */}
      <div className="relative z-10 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-text-secondary">
        <div className="flex items-center gap-1.5 font-medium">
          <Calendar className="w-3.5 h-3.5 text-text-muted" />
          <span>{project.target_date ? formatDate(project.target_date, 'MMM d, yyyy') : 'Ongoing'}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono text-text-muted">
            {project.member_count || 1} members
          </span>
          <div className="flex -space-x-1.5 overflow-hidden">
            <Avatar name={project.name} size="xs" />
          </div>
        </div>
      </div>
    </div>
  );
};
