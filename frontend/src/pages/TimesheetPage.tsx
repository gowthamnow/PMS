import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { TimeEntry, Task, Project } from '../types';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { DatePicker } from '../components/ui/DatePicker';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  addWeeks,
  subWeeks,
  isSameDay,
  parseISO,
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Calendar,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const TimesheetPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [currentWeekDate, setCurrentWeekDate] = useState<Date>(new Date());
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);

  // Form states
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [logDate, setLogDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [logHours, setLogHours] = useState('');
  const [logDescription, setLogDescription] = useState('');

  // Calculate week range (Monday to Sunday)
  const weekStart = startOfWeek(currentWeekDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeekDate, { weekStartsOn: 1 });

  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  const weekRangeLabel = `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`;

  // Fetch Time Entries for the week
  const fromDate = format(weekStart, 'yyyy-MM-dd');
  const toDate = format(weekEnd, 'yyyy-MM-dd');

  const {
    data: timeEntries = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['time-entries', { from_date: fromDate, to_date: toDate }],
    queryFn: () =>
      api.tasks.getTimeEntries({
        from_date: fromDate,
        to_date: toDate,
      }),
  });

  // Fetch available tasks for logging modal
  const { data: tasksData } = useQuery({
    queryKey: ['tasks', { page: 1, page_size: 100 }],
    queryFn: () => api.tasks.getTasks({ page: 1, page_size: 100 }),
  });

  // Add Time Entry Mutation
  const addEntryMutation = useMutation({
    mutationFn: (data: { task_id: string; work_date: string; duration_hours: number; description?: string }) =>
      api.tasks.addTimeEntry(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-entries'] });
      setIsLogModalOpen(false);
      setSelectedTaskId('');
      setLogHours('');
      setLogDescription('');
      toast.success('Time logged');
    },
    onError: () => toast.error('Failed to log time'),
  });

  // Delete Time Entry Mutation
  const deleteEntryMutation = useMutation({
    mutationFn: (id: string) => api.tasks.deleteTimeEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-entries'] });
      toast.success('Time entry removed');
    },
  });

  // Aggregate time entries by Task
  const safeTimeEntries: TimeEntry[] = Array.isArray(timeEntries)
    ? timeEntries
    : ((timeEntries as any)?.items || []);

  const taskMap = new Map<string, { task: Task; days: Record<string, number>; total: number; entries: TimeEntry[] }>();

  safeTimeEntries.forEach((entry) => {
    const taskId = entry.task_id || entry.task?.id || 'unassigned';
    const taskName = entry.task?.title || 'General Engineering Support';
    const entryDate = entry.work_date.slice(0, 10);

    if (!taskMap.has(taskId)) {
      taskMap.set(taskId, {
        task: entry.task || ({ id: taskId, title: taskName, task_number: 0 } as Task),
        days: {},
        total: 0,
        entries: [],
      });
    }

    const row = taskMap.get(taskId)!;
    row.days[entryDate] = (row.days[entryDate] || 0) + Number(entry.duration_hours);
    row.total += Number(entry.duration_hours);
    row.entries.push(entry);
  });

  const taskRows = Array.from(taskMap.values());

  // Daily totals
  const dailyTotals = weekDays.map((day) => {
    const dStr = format(day, 'yyyy-MM-dd');
    return safeTimeEntries
      .filter((e) => e.work_date && e.work_date.slice(0, 10) === dStr)
      .reduce((sum, e) => sum + Number(e.duration_hours || 0), 0);
  });

  const totalWeeklyHours = dailyTotals.reduce((a, b) => a + b, 0);


  if (error) {
    return (
      <ErrorState
        title="Could not load timesheet"
        message="Please verify server availability."
        onRetry={refetch}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header and Week Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Engineering Timesheet</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Log bench time, PCB routing, firmware programming, and hardware verification hours.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Week Navigation */}
          <div className="flex items-center gap-1 bg-white border border-border rounded-md p-1 shadow-subtle text-xs">
            <button
              onClick={() => setCurrentWeekDate(subWeeks(currentWeekDate, 1))}
              className="p-1 hover:bg-slate-100 rounded text-text-muted hover:text-text-primary transition-colors"
              title="Previous week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 font-semibold text-text-primary whitespace-nowrap">
              {weekRangeLabel}
            </span>
            <button
              onClick={() => setCurrentWeekDate(addWeeks(currentWeekDate, 1))}
              className="p-1 hover:bg-slate-100 rounded text-text-muted hover:text-text-primary transition-colors"
              title="Next week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentWeekDate(new Date())}
              className="text-[11px] font-medium text-copper-700 hover:bg-copper-50 px-2 py-1 rounded border border-copper-200 ml-1"
            >
              Today
            </button>
          </div>

          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsLogModalOpen(true)}
          >
            Log Hours
          </Button>
        </div>
      </div>

      {/* Timesheet Grid */}
      <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-slate-50 font-semibold text-text-secondary uppercase tracking-wider">
                <th className="px-4 py-3 min-w-[240px]">Engineering Task</th>
                {weekDays.map((day) => {
                  const isToday = isSameDay(day, new Date());
                  return (
                    <th
                      key={day.toISOString()}
                      className={`w-24 px-3 py-3 text-center ${
                        isToday ? 'bg-copper-50 text-copper-900 border-b-2 border-copper-600' : ''
                      }`}
                    >
                      <span className="block text-[11px] font-bold">{format(day, 'EEE')}</span>
                      <span className="block text-[10px] text-text-muted font-mono font-normal">
                        {format(day, 'MMM d')}
                      </span>
                    </th>
                  );
                })}
                <th className="w-24 px-4 py-3 text-right bg-slate-100/60">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center">
                    <Spinner size="md" />
                  </td>
                </tr>
              ) : taskRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-text-muted italic">
                    No hours logged for this week. Click "+ Log Hours" to track your work.
                  </td>
                </tr>
              ) : (
                taskRows.map((row) => (
                  <tr key={row.task.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-semibold text-text-primary line-clamp-1">
                          {row.task.title}
                        </span>
                        {row.task.task_number > 0 && (
                          <span className="font-mono text-[10px] text-copper-700">
                            #ENG-{row.task.task_number.toString().padStart(3, '0')}
                          </span>
                        )}
                      </div>
                    </td>

                    {weekDays.map((day) => {
                      const dStr = format(day, 'yyyy-MM-dd');
                      const hours = row.days[dStr];
                      const isToday = isSameDay(day, new Date());

                      return (
                        <td
                          key={dStr}
                          className={`px-3 py-3 text-center font-mono ${
                            isToday ? 'bg-copper-50/40' : ''
                          }`}
                        >
                          {hours ? (
                            <span className="px-2 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded font-semibold text-xs">
                              {hours}h
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}

                    <td className="px-4 py-3 text-right font-mono font-bold text-copper-700 bg-slate-50/50">
                      {row.total}h
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {/* Total Row */}
            <tfoot>
              <tr className="border-t-2 border-border bg-slate-100 font-semibold text-xs">
                <td className="px-4 py-3 uppercase tracking-wider text-text-primary">
                  Total Daily Hours
                </td>
                {dailyTotals.map((tot, idx) => (
                  <td
                    key={idx}
                    className="px-3 py-3 text-center font-mono font-bold text-text-primary"
                  >
                    {tot > 0 ? `${tot}h` : '0h'}
                  </td>
                ))}
                <td className="px-4 py-3 text-right font-mono text-sm font-bold text-copper-700 bg-copper-100/60">
                  {totalWeeklyHours}h
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Log Time Modal */}
      <Modal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        title="Log Engineering Work Hours"
        description="Select an active task and specify duration and bench description."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setIsLogModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!selectedTaskId || !logHours || parseFloat(logHours) <= 0}
              isLoading={addEntryMutation.isPending}
              onClick={() =>
                addEntryMutation.mutate({
                  task_id: selectedTaskId,
                  work_date: logDate,
                  duration_hours: parseFloat(logHours),
                  description: logDescription,
                })
              }
            >
              Submit Time Entry
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select
            label="Engineering Task"
            required
            value={selectedTaskId}
            onChange={(e) => setSelectedTaskId(e.target.value)}
          >
            <option value="">Select a task</option>
            {tasksData?.items?.map((t) => (
              <option key={t.id} value={t.id}>
                #ENG-{t.task_number.toString().padStart(3, '0')}: {t.title}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-2 gap-3">
            <DatePicker
              label="Work Date"
              required
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
            />
            <Input
              label="Duration (Hours)"
              type="number"
              step="0.25"
              required
              placeholder="e.g. 3.5"
              value={logHours}
              onChange={(e) => setLogHours(e.target.value)}
            />
          </div>

          <Input
            label="Work Summary / Bench Notes"
            placeholder="e.g. Impedance matched RF trace layout and DRC check"
            value={logDescription}
            onChange={(e) => setLogDescription(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
};
