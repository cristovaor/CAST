import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import type { TimeSeriesPoint } from '@/types/domain';

interface ProcessingChartProps {
  data: TimeSeriesPoint[];
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg">
      <div className="text-text-muted mb-0.5">{label}</div>
      <div className="font-semibold">{payload[0].value} vídeos processados</div>
    </div>
  );
}

export function ProcessingChart({ data }: ProcessingChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="processGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#2563EB" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis
          dataKey="date"
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
        <Area
          type="monotone"
          dataKey="value"
          stroke="#2563EB"
          strokeWidth={2}
          fill="url(#processGrad)"
          dot={false}
          activeDot={{ r: 4, fill: '#2563EB', strokeWidth: 2, stroke: '#fff' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
