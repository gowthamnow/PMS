import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { TaskStatus } from '../../types';
import { STATUS_LABELS } from '../../lib/constants';

const STATUS_CHART_COLORS: Record<TaskStatus, string> = {
  TODO: '#64748B',
  IN_PROGRESS: '#2563EB',
  IN_REVIEW: '#7C3AED',
  BLOCKED: '#DC2626',
  DONE: '#16A34A',
};

export interface ProgressDonutProps {
  tasksByStatus: Record<TaskStatus, number>;
  className?: string;
}

export const ProgressDonut: React.FC<ProgressDonutProps> = ({ tasksByStatus, className }) => {
  const data = (Object.keys(STATUS_LABELS) as TaskStatus[]).map((st) => ({
    name: STATUS_LABELS[st],
    status: st,
    value: tasksByStatus[st] || 0,
    color: STATUS_CHART_COLORS[st],
  }));

  const total = data.reduce((sum, item) => sum + item.value, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
      return (
        <div className="bg-white border border-border shadow-md rounded p-2 text-xs">
          <p className="font-semibold text-text-primary flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: item.color }}
            />
            {item.name}: <span className="font-mono">{item.value}</span> ({pct}%)
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`w-full flex flex-col items-center justify-center ${className || ''}`}>
      <div className="w-full h-[180px] relative">
        {total === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-xs text-text-muted italic">
            No task data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={75}
                paddingAngle={3}
                dataKey="value"
                stroke="#FFFFFF"
                strokeWidth={2}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        )}
        {total > 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xl font-bold font-mono text-text-primary">{total}</span>
            <span className="text-[10px] text-text-muted uppercase tracking-wider">Total</span>
          </div>
        )}
      </div>

      {/* Legend below */}
      <div className="flex flex-wrap items-center justify-center gap-3 mt-3 text-[11px] text-text-secondary">
        {data.map((item) => (
          <div key={item.status} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span>{item.name}</span>
            <span className="font-mono text-text-muted">({item.value})</span>
          </div>
        ))}
      </div>
    </div>
  );
};
