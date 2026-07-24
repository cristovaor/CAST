import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import type { ChartDataPoint } from '@/types/domain';
import { getMicroActionConfig } from '@/lib/utils';

interface MicroActionDistributionChartProps {
  data: ChartDataPoint[];
}

const ACTIONS = ['OLHO_FECHADO', 'OLHANDO_CANTO', 'MEXEU_LABIOS', 'VIROU_ROSTO'] as const;

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 text-white text-xs px-3 py-2.5 rounded-lg shadow-lg min-w-[160px]">
      <div className="text-slate-400 mb-2 font-medium">{label}</div>
      {payload.map((entry) => {
        const cfg = getMicroActionConfig(entry.name as typeof ACTIONS[number]);
        return (
          <div key={entry.name} className="flex items-center justify-between gap-4 mb-1">
            <span className="text-slate-300">{cfg.shortLabel} {cfg.label}</span>
            <span className="font-semibold">{entry.value}</span>
          </div>
        );
      })}
    </div>
  );
}

function CustomLegend() {
  return (
    <div className="flex flex-wrap justify-center gap-3 mt-2">
      {ACTIONS.map((action) => {
        const cfg = getMicroActionConfig(action);
        return (
          <div key={action} className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: cfg.color }} />
            <span className="font-mono font-semibold text-slate-600">{cfg.shortLabel}</span>
            <span>{cfg.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function MicroActionDistributionChart({ data }: MicroActionDistributionChartProps) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barSize={10} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'Inter' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'Inter' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          {ACTIONS.map((action) => {
            const cfg = getMicroActionConfig(action);
            return (
              <Bar key={action} dataKey={action} fill={cfg.color} radius={[2, 2, 0, 0]} name={action} />
            );
          })}
        </BarChart>
      </ResponsiveContainer>
      <CustomLegend />
    </div>
  );
}
