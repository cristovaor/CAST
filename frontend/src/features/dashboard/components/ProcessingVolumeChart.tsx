import { useMemo } from 'react';
import {
  Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ComposedChart, Line
} from 'recharts';
import type { TimeSeriesPoint } from '@/types/domain';

interface ProcessingVolumeChartProps {
  data: TimeSeriesPoint[];
  isLoading?: boolean;
}

interface ProcessingTooltipEntry {
  dataKey?: string | number;
  value?: number;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: ProcessingTooltipEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  
  const value = payload.find(p => p.dataKey === 'value')?.value;
  const avg = payload.find(p => p.dataKey === 'avg')?.value;

  return (
    <div className="bg-surface border border-border text-text-primary text-xs px-3 py-2.5 rounded-lg shadow-xl ring-1 ring-black/5 min-w-[140px]">
      <div className="text-text-secondary mb-1.5 font-medium">{label}</div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-600" />
          <span className="font-medium text-text-secondary">Processados</span>
          </div>
        <span className="font-semibold text-text-primary">{value}</span>
        </div>
        {avg !== undefined && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-0.5 bg-slate-400" />
          <span className="text-text-secondary">Média móvel</span>
            </div>
        <span className="text-text-secondary">{avg?.toFixed(1)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ProcessingVolumeChart({ data, isLoading }: ProcessingVolumeChartProps) {
  // Calculate a simple moving average (SMA) of 3 points for illustration
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((point, index, arr) => {
      let sum = 0;
      let count = 0;
      for (let i = Math.max(0, index - 2); i <= index; i++) {
        sum += arr[i].value;
        count++;
      }
      return {
        ...point,
        avg: sum / count,
      };
    });
  }, [data]);

  const totalPeriod = useMemo(() => data?.reduce((acc, p) => acc + p.value, 0) || 0, [data]);

  if (isLoading) {
    return (
      <div className="card p-6 xl:col-span-3 flex flex-col h-full min-h-[300px]">
        <div className="skeleton w-1/3 h-5 mb-2 rounded" />
        <div className="skeleton w-1/4 h-3 mb-6 rounded" />
        <div className="skeleton flex-1 w-full rounded-xl" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
    <div className="card p-6 xl:col-span-3 flex flex-col items-center justify-center h-full min-h-[300px] text-text-secondary">
        <p className="text-sm font-medium">Nenhum dado de processamento disponível.</p>
      <p className="text-xs text-text-muted mt-1">O volume aparecerá aqui quando os vídeos forem processados.</p>
      </div>
    );
  }

  return (
    <div className="card p-6 xl:col-span-3 flex flex-col h-full bg-surface shadow-sm ring-1 ring-border/50">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-6 gap-4">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary tracking-tight">Volume de processamento</h2>
          <p className="text-[13px] text-text-secondary mt-1">Vídeos analisados pelo pipeline nas últimas 12 semanas</p>
        </div>
        <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-text-primary leading-none">{totalPeriod}</span>
            <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Total</span>
          </div>
          <span className="inline-flex items-center text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
            ↑ 12% vs. período anterior
          </span>
        </div>
      </div>
      
      <div className="flex-1 min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -25 }}>
            <defs>
              <linearGradient id="processGradNew" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#2563EB" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#2563EB" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" stroke="#F1F5F9" vertical={false} />
            <XAxis
              dataKey="date"
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
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#CBD5E1', strokeWidth: 1, strokeDasharray: '4 4' }} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#2563EB"
              strokeWidth={2}
              fill="url(#processGradNew)"
              dot={false}
              activeDot={{ r: 5, fill: '#2563EB', strokeWidth: 2, stroke: '#fff' }}
            />
            <Line 
              type="monotone" 
              dataKey="avg" 
              stroke="#94A3B8" 
              strokeWidth={2} 
              strokeDasharray="4 4" 
              dot={false} 
              activeDot={false} 
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-center gap-6 mt-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-blue-600/80" />
          <span className="text-[11px] font-medium text-text-secondary">Vídeos processados</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-slate-400" />
          <span className="text-[11px] font-medium text-text-secondary">Média móvel</span>
        </div>
      </div>
    </div>
  );
}
