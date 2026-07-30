import React, { useMemo } from 'react';
import { eegToVideoMs, useEEGData, videoToEegMs } from './useEEG';
import { sliceWindow, decimate } from './utils/downsample';
import { EEG_BANDS } from './bands';
import { usePlaybackStore } from '@/features/playback/usePlaybackStore';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea
} from 'recharts';
import { Loader2, BrainCircuit } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { cn, getMicroActionConfig } from '@/lib/utils';
import type { MicroAction } from '@/types/domain';
import type { TimelineEventDTO } from '@/features/videos/types';

// Sliding window: 5 seconds before and after the current video time
const WINDOW_HALF_MS = 5000;

interface EEGChartProps {
  eegId?: string;
  /** Facial micro-action events to overlay — this is the face↔EEG crossing. */
  events?: TimelineEventDTO[];
  variant?: 'card' | 'embedded';
}

function ChartFrame({
  variant,
  title,
  children,
}: {
  variant: 'card' | 'embedded';
  title?: string;
  children: React.ReactNode;
}) {
  if (variant === 'embedded') {
    return (
      <div className="w-full">
        {title && <div className="text-xs font-medium text-text-muted py-1">{title}</div>}
        <div className="h-48">{children}</div>
      </div>
    );
  }
  return (
    <Card className="w-full">
      {title && (
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className="h-64 pt-0">{children}</CardContent>
    </Card>
  );
}

export const EEGChart: React.FC<EEGChartProps> = ({ eegId, events, variant = 'card' }) => {
  const { data, isLoading, error } = useEEGData(eegId);
  const currentTimeMs = usePlaybackStore((s) => s.currentTimeMs);
  const requestSeek = usePlaybackStore((s) => s.requestSeek);

  const syncTransform = data?.sync_transform;
  const eegTimeMs = videoToEegMs(currentTimeMs, syncTransform);
  const windowStart = eegTimeMs - WINDOW_HALF_MS;
  const windowEnd = eegTimeMs + WINDOW_HALF_MS;

  // Sliding window slice (binary search over sorted data) + decimation so
  // recharts stays smooth even with tens of thousands of CSV rows.
  const visibleData = useMemo(() => {
    if (!data || !data.data.length) return [];
    return decimate(sliceWindow(data.data, windowStart, windowEnd));
  }, [data, windowStart, windowEnd]);

  // Facial micro-action bands intersecting the current window, converted to
  // EEG time (video time − sync_offset). This is the face↔EEG crossing.
  const overlayBands = useMemo(() => {
    if (!events?.length) return [];
    return events
      .map((ev) => ({
        key: ev.event_id,
        action: ev.action as MicroAction,
        startEegMs: videoToEegMs(ev.start_time * 1000, syncTransform),
        endEegMs: videoToEegMs(ev.end_time * 1000, syncTransform),
      }))
      .filter((b) => b.endEegMs >= windowStart && b.startEegMs <= windowEnd);
  }, [events, syncTransform, windowStart, windowEnd]);

  const handleClick = (state: { activeLabel?: string | number }) => {
    const eegMs = Number(state?.activeLabel);
    if (!Number.isFinite(eegMs)) return; // click outside plotted points
    requestSeek(eegToVideoMs(eegMs, syncTransform));
  };

  if (!eegId || (data && data.data.length === 0)) {
    return (
      <ChartFrame variant={variant}>
        <div
          className={cn(
            'h-full min-h-32 flex flex-col items-center justify-center gap-2 text-sm',
            variant === 'embedded' ? 'text-text-muted' : 'text-muted-foreground',
          )}
        >
          <BrainCircuit className="w-6 h-6 opacity-50" />
          <span>Nenhum EEG associado a esta sessão.</span>
          <span className="text-xs opacity-70">Envie um CSV de EEG para visualizar os sinais sincronizados.</span>
        </div>
      </ChartFrame>
    );
  }

  if (isLoading) {
    return (
      <ChartFrame variant={variant}>
        <div className="h-full min-h-32 flex items-center justify-center text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando sinais cerebrais...
        </div>
      </ChartFrame>
    );
  }

  if (error || !data) {
    return (
      <ChartFrame variant={variant}>
        <div className="h-full min-h-32 flex items-center justify-center text-red-500 text-sm">
          Não foi possível carregar os dados de EEG.
        </div>
      </ChartFrame>
    );
  }

  // Distinct micro-actions currently visible in the window (for the legend)
  const activeActions = Array.from(new Set(overlayBands.map((b) => b.action)));

  return (
    <ChartFrame variant={variant} title="Atividade Cerebral × Expressões Faciais">
      {activeActions.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-1 text-[10px]">
          <span className={cn(variant === 'embedded' ? 'text-text-muted' : 'text-muted-foreground')}>
            Microações na janela:
          </span>
          {activeActions.map((action) => {
            const cfg = getMicroActionConfig(action);
            return (
              <span key={action} className="inline-flex items-center gap-1 font-medium">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cfg.color }} />
                <span className={cn(variant === 'embedded' ? 'text-text-disabled' : 'text-text-secondary')}>{cfg.label}</span>
              </span>
            );
          })}
        </div>
      )}
      <ResponsiveContainer width="100%" height={activeActions.length > 0 ? '85%' : '100%'}>
        <LineChart
          data={visibleData}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          onClick={handleClick}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="timestamp_ms"
            type="number"
            domain={[windowStart, windowEnd]}
            allowDataOverflow
            tickFormatter={(val) => `${(val / 1000).toFixed(1)}s`}
            minTickGap={30}
          />
          <YAxis />

          {/* Facial micro-action bands overlaid on the brain signals */}
          {overlayBands.map((band) => (
            <ReferenceArea
              key={band.key}
              x1={band.startEegMs}
              x2={band.endEegMs}
              fill={getMicroActionConfig(band.action).color}
              fillOpacity={0.12}
              stroke={getMicroActionConfig(band.action).color}
              strokeOpacity={0.4}
              strokeDasharray="2 2"
              ifOverflow="hidden"
            />
          ))}
          <Tooltip
            labelFormatter={(val) => `${(Number(val) / 1000).toFixed(2)}s`}
            contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
          />
          <Legend wrapperStyle={{ fontSize: '12px' }} />

          {EEG_BANDS.map((band) => (
            <Line
              key={band.key}
              type="monotone"
              dataKey={band.key}
              name={band.label}
              stroke={band.color}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}

          {/* The cursor line showing exactly where the video is */}
          <ReferenceLine x={eegTimeMs} stroke="#64748b" strokeDasharray="3 3" label="Atual" />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
};
