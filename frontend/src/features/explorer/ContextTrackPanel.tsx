import { useQueries } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiClient } from '@/lib/api';
import { usePlaybackStore } from '@/features/playback/usePlaybackStore';
import { resolveTrackUrl } from './ocularSeries';
import type { ExplorerManifest } from './types';

export function ContextTrackPanel({ manifest }: { manifest?: ExplorerManifest }) {
  const tracks = manifest?.tracks.filter((track) => track.modality === 'context') ?? [];
  const cursorMs = usePlaybackStore((state) => state.currentTimeMs);
  const selection = usePlaybackStore((state) => state.selectionMs);
  const bounds = selection ?? { startMs: Math.max(0,cursorMs-10_000), endMs: cursorMs+10_000 };
  const queries = useQueries({ queries: tracks.map((track) => ({ queryKey: ['context-track',track.id,bounds.startMs,bounds.endMs], queryFn: () => apiClient.get<unknown>(resolveTrackUrl(track,bounds.startMs*1000,bounds.endMs*1000)), staleTime: 15_000 })) });
  if (!tracks.length) return null;
  const environment = tracks.flatMap((track,index) => track.kind === 'line' ? samples(queries[index]?.data).map((row) => ({ time: Number(row.source_time_us)/1e6, value: Number(row.value), series: track.label })) : []);
  const events = tracks.flatMap((track,index) => track.kind === 'markers' ? samples(queries[index]?.data) : []);
  return <section className="rounded-xl border border-border bg-surface p-4"><div className="flex items-center gap-2"><FlaskConical size={16} className="text-indigo-600"/><div><h2 className="text-sm font-semibold">Contexto experimental</h2><p className="text-xs text-text-muted">Ambiente e markers no intervalo selecionado, preservando clock e método.</p></div></div><div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">{environment.length > 0 ? <div className="h-52"><ResponsiveContainer width="100%" height="100%"><LineChart data={environment}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="time" unit="s" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip/><Line dataKey="value" stroke="#4f46e5" dot={false} connectNulls/></LineChart></ResponsiveContainer></div> : <p className="rounded-lg bg-surface-muted p-4 text-xs text-text-muted">Sem amostras ambientais nesta janela.</p>}<div className="max-h-52 overflow-auto rounded-lg border border-border"><p className="sticky top-0 bg-surface-muted px-3 py-2 text-[10px] font-semibold uppercase">Eventos ({events.length})</p>{events.slice(0,100).map((event,index) => <div key={String(event.id ?? event.client_event_id ?? index)} className="border-t border-border px-3 py-2 text-xs"><strong>{String(event.event_type ?? 'marker')}</strong><span className="ml-2 font-mono text-text-muted">{(Number(event.source_time_us)/1e6).toFixed(3)}s</span></div>)}</div></div></section>;
}

function samples(data: unknown): Record<string, unknown>[] { if (Array.isArray(data)) return data as Record<string, unknown>[]; if (data && typeof data === 'object' && Array.isArray((data as {samples?: unknown}).samples)) return (data as {samples: Record<string, unknown>[]}).samples; return []; }
