import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { WorkloadItem } from '../../types';

export interface WorkloadBarProps {
  data: WorkloadItem[];
  className?: string;
}

export const WorkloadBar: React.FC<WorkloadBarProps> = ({ data, className }) => {
  if (!data || data.length === 0) {
    return (
      <div className="h-[220px] flex items-center justify-center text-xs text-text-muted italic">
        No team workload data available
      </div>
    );
  }

  // Format data for stacked bar chart
  const chartData = data.map((item: any) => {
    const fullName = item.full_name || item.user?.full_name || item.username || item.user?.username || 'Engineer';
    return {
      name: fullName.split(' ')[0],
      fullName,
      Todo: item.todo || 0,
      InProgress: item.in_progress || 0,
      InReview: item.in_review || 0,
      Blocked: item.blocked || 0,
      Done: item.done || 0,
      total: item.total || item.task_count || 0,
      hours: item.hours_this_week || item.hours || 0,
    };
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-white border border-border shadow-md rounded p-2.5 text-xs">
          <p className="font-semibold text-text-primary mb-1">{item.fullName}</p>
          <div className="flex flex-col gap-0.5 text-text-secondary text-[11px]">
            <span className="text-slate-600">To Do: {item.Todo}</span>
            <span className="text-blue-600">In Progress: {item.InProgress}</span>
            <span className="text-violet-600">In Review: {item.InReview}</span>
            <span className="text-red-600">Blocked: {item.Blocked}</span>
            <span className="text-green-600">Done: {item.Done}</span>
            <div className="border-t border-border mt-1 pt-1 font-semibold text-text-primary flex justify-between">
              <span>Total Tasks: {item.total}</span>
              <span className="font-mono text-copper-700">{item.hours}h logged</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const chartHeight = Math.max(180, chartData.length * 36);

  return (
    <div className={`w-full ${className || ''}`}>
      <div style={{ height: `${chartHeight}px` }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
          >
            <XAxis type="number" tick={{ fontSize: 10, fill: '#94A3B8' }} />
            <YAxis
              dataKey="name"
              type="category"
              tick={{ fontSize: 11, fill: '#475569' }}
              width={65}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
              iconSize={8}
            />
            <Bar dataKey="Todo" stackId="a" fill="#64748B" name="To Do" />
            <Bar dataKey="InProgress" stackId="a" fill="#2563EB" name="In Progress" />
            <Bar dataKey="InReview" stackId="a" fill="#7C3AED" name="In Review" />
            <Bar dataKey="Blocked" stackId="a" fill="#DC2626" name="Blocked" />
            <Bar dataKey="Done" stackId="a" fill="#16A34A" name="Done" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
