import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import type { ChartDataPoint } from '@/types/domain';
import { getMicroActionConfig } from '@/lib/utils';
import { Filter } from 'lucide-react';

interface MicroActionsChartProps {
  data: ChartDataPoint[];
  isLoading?: boolean;
}

const ACTIONS = ['OLHO_FECHADO', 'OLHANDO_CANTO', 'MEXEU_LABIOS', 'VIROU_ROSTO', 'MEXEU_SOBRANCELHA'] as const;

interface MicroActionTooltipEntry {
  name: typeof ACTIONS[number];
  value: number | string;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: MicroActionTooltipEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border text-text-primary text-xs px-3 py-2.5 rounded-lg shadow-xl ring-1 ring-black/5 min-w-[200px]">
      <div className="text-text-secondary mb-2 font-medium border-b border-border pb-1.5">{label}</div>
      <div className="space-y-1.5">
        {payload.map((entry) => {
          const cfg = getMicroActionConfig(entry.name as typeof ACTIONS[number]);
          return (
            <div key={entry.name} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: cfg.color }} />
            <span className="text-text-secondary font-medium">
              {cfg.shortLabel} <span className="text-text-muted font-normal ml-0.5">({cfg.label})</span>
                </span>
              </div>
            <span className="font-semibold text-text-primary">{entry.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ALL_STUDIES = 'Todos os estudos';

export function MicroActionsChart({ data, isLoading }: MicroActionsChartProps) {
  const [filter, setFilter] = useState(ALL_STUDIES);

  // Study options come from the data itself, so the filter always matches
  // what is actually plotted.
  const studies = useMemo(
    () => [ALL_STUDIES, ...Array.from(new Set((data ?? []).map((d) => String(d.name))))],
    [data],
  );

  // Reset to "all" if the selected study disappears from a refreshed dataset.
  const activeFilter = studies.includes(filter) ? filter : ALL_STUDIES;

  const visibleData = useMemo(
    () => (activeFilter === ALL_STUDIES ? (data ?? []) : (data ?? []).filter((d) => String(d.name) === activeFilter)),
    [data, activeFilter],
  );

  const totals = useMemo(() => {
    const t = {} as Record<string, number>;
    ACTIONS.forEach(a => t[a] = 0);
    if (!visibleData) return t;
    visibleData.forEach(d => {
      ACTIONS.forEach(a => {
        t[a] += Number(d[a] || 0);
      });
    });
    return t;
  }, [visibleData]);

  if (isLoading) {
    return (
      <div className="card p-6 xl:col-span-2 flex flex-col h-full min-h-[300px]">
        <div className="skeleton w-1/3 h-5 mb-2 rounded" />
        <div className="skeleton w-1/4 h-3 mb-6 rounded" />
        <div className="skeleton flex-1 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="card p-6 xl:col-span-2 flex flex-col h-full bg-surface shadow-sm ring-1 ring-border/50">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-6 gap-4">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary tracking-tight">Distribuição de microações</h2>
          <p className="text-[13px] text-text-secondary mt-1">Eventos detectados por estudo e tipo de ação facial</p>
        </div>
        <div className="shrink-0 relative">
          <Filter
            size={12}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <select
            value={activeFilter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filtrar por estudo"
            className={
              'appearance-none text-xs font-medium text-text-secondary bg-surface-muted border border-border ' +
              'pl-7 pr-2.5 py-1.5 rounded-md hover:bg-surface-hover transition-colors cursor-pointer ' +
              'focus:outline-none focus:ring-2 focus:ring-blue-500/30'
            }
          >
            {studies.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={visibleData} margin={{ top: 10, right: 10, bottom: 0, left: -25 }} barSize={12} barGap={3}>
            <CartesianGrid strokeDasharray="4 4" stroke="#F1F5F9" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'Inter' }}
              axisLine={{ stroke: '#E2E8F0' }}
              tickLine={false}
              dy={10}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'Inter' }}
              axisLine={false}
              tickLine={false}
              dx={-10}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F8FAFC' }} />
            {ACTIONS.map((action) => {
              const cfg = getMicroActionConfig(action);
              // Using an opacity or slightly desaturated fill can be done via CSS, but we'll stick to the solid colors for accuracy, with rounded tops
              return (
                <Bar key={action} dataKey={action} fill={cfg.color} radius={[3, 3, 0, 0]} name={action} />
              );
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Footer Totals / Compact Legend */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5 pt-4 border-t border-border">
        {ACTIONS.map((action) => {
          const cfg = getMicroActionConfig(action);
          return (
          <div key={action} className="flex flex-col items-center p-2 rounded-lg bg-surface-muted/50 border border-border/50">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: cfg.color }} />
            <span className="text-[10px] font-semibold text-text-secondary tracking-wider font-mono">{cfg.shortLabel}</span>
              </div>
            <div className="text-lg font-bold text-text-primary leading-none">{totals[action]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
