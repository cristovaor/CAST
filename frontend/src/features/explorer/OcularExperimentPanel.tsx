import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { AlertTriangle, Crosshair, Eye, Loader2, Upload } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiClient } from '@/lib/api';
import { usePlaybackStore } from '@/features/playback/usePlaybackStore';
import { PupilExperimentConsole } from '@/features/pupil/PupilExperimentConsole';
import { ocularValue, resolveTrackUrl, type OcularSeriesPayload } from './ocularSeries';
import type { ExplorerManifest } from './types';

export function OcularExperimentPanel({ sessionId, manifest, faceArtifactId }: { sessionId: string; manifest?: ExplorerManifest; faceArtifactId?: string }) {
  const { t } = useTranslation('analysis');
  const [pupilOpen, setPupilOpen] = useState(false);
  const [pupilLayer, setPupilLayer] = useState('FILTERED');
  const cursorMs = usePlaybackStore((state) => state.currentTimeMs);
  const selection = usePlaybackStore((state) => state.selectionMs);
  const bounds = selection ?? { startMs: Math.max(0, cursorMs - 10_000), endMs: cursorMs + 10_000 };
  const gaze = manifest?.tracks.filter((track) => track.modality === 'gaze') ?? [];
  const pupil = manifest?.tracks.filter((track) => track.modality === 'pupil') ?? [];
  const ocularTracks = [...gaze, ...pupil];
  const queries = useQueries({ queries: ocularTracks.map((track) => ({
    queryKey: ['ocular-series', track.id, bounds.startMs, bounds.endMs],
    queryFn: () => apiClient.get<OcularSeriesPayload>(resolveTrackUrl(track, bounds.startMs * 1000, bounds.endMs * 1000)),
    staleTime: 15_000,
  })) });
  const payloadById = new Map(ocularTracks.map((track, index) => [track.id, queries[index]?.data]));
  const calibratedTrack = gaze.find((track) => track.label.toLowerCase().includes('calibrado')) ?? gaze[0];
  const gazeSamples = calibratedTrack ? payloadById.get(calibratedTrack.id)?.samples ?? [] : [];
  const selectedPupil = pupil.find((track) => track.quality_summary.layer === pupilLayer) ?? pupil[0];
  const pupilSamples = selectedPupil ? payloadById.get(selectedPupil.id)?.samples ?? [] : [];
  const chartRows = mergeSeries(gazeSamples, pupilSamples);
  const heatmap = gazeHeatmap(gazeSamples);
  const gazeMetrics = calibratedTrack?.quality_summary;

  if (!ocularTracks.length && !faceArtifactId) return null;
  return (
    <section className="space-y-4" data-testid="ocular-experiment-panel">
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900 dark:bg-amber-950/20">
          <div className="flex items-center gap-2"><Crosshair size={16} className="text-amber-700" aria-hidden="true"/><h2 className="text-sm font-semibold">{t('explorer.ocular.gazeTitle')}</h2></div>
          {gaze.length ? <><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><Metric label={t('explorer.ocular.medianError')} value={format(gazeMetrics?.median_error_deg, '°')} /><Metric label="P95" value={format(gazeMetrics?.p95_error_deg, '°')} /><Metric label={t('explorer.ocular.validSamples')} value={percent(gazeMetrics?.valid_ratio)} /><Metric label="AOI balanced acc." value={format(gazeMetrics?.balanced_accuracy_aoi)} /></div><div className="mt-3 grid grid-cols-3 gap-1" role="img" aria-label={t('explorer.ocular.heatmap')}>{heatmap.map((count,index) => <div key={index} className="flex aspect-[2/1] items-center justify-center rounded text-[10px] font-semibold text-amber-950" style={{ backgroundColor: `rgba(245,158,11,${0.08 + count / Math.max(1,...heatmap) * .75})` }}>{count}</div>)}</div></> : <p className="mt-3 text-xs text-text-muted">{t('explorer.ocular.noGaze')}</p>}
          <p className="mt-3 flex gap-2 text-xs text-amber-800 dark:text-amber-300"><AlertTriangle size={14} className="shrink-0" aria-hidden="true"/>{t('explorer.ocular.gazeCaveat')}</p>
        </div>
        <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/20">
          <div className="flex items-center gap-2"><Eye size={16} className="text-violet-700" aria-hidden="true"/><h2 className="text-sm font-semibold">{t('explorer.ocular.pupilTitle')}</h2>{faceArtifactId && <button type="button" onClick={() => setPupilOpen(true)} className="ml-auto inline-flex items-center gap-1 rounded-md bg-violet-600 px-2.5 py-1.5 text-[10px] font-semibold text-white"><Upload size={12} aria-hidden="true"/>{t('explorer.ocular.process')}</button>}</div>
          <div className="mt-3 flex flex-wrap gap-2">{['RAW','DERIVED','FILTERED'].map((layer) => { const available = pupil.some((item) => item.quality_summary.layer === layer); return <button type="button" key={layer} disabled={!available} aria-pressed={pupilLayer === layer && available} onClick={() => setPupilLayer(layer)} className={`rounded-full px-2 py-1 text-[10px] font-semibold ${pupilLayer === layer && available ? 'bg-violet-600 text-white' : available ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{layer}</button>; })}</div>
          <p className="mt-3 flex gap-2 text-xs text-violet-800 dark:text-violet-300"><AlertTriangle size={14} className="shrink-0" aria-hidden="true"/>{t('explorer.ocular.pupilCaveat')}</p>
        </div>
      </div>
      {queries.some((query) => query.isLoading) && <div className="flex items-center justify-center rounded-xl border border-border bg-surface p-6 text-xs text-text-muted"><Loader2 size={15} className="mr-2 animate-spin" aria-hidden="true"/>{t('explorer.ocular.loading')}</div>}
      {chartRows.length > 0 && <div className="h-72 rounded-xl border border-border bg-surface p-4"><p className="mb-2 text-xs font-semibold">{t('explorer.ocular.series')}</p><ResponsiveContainer width="100%" height="90%"><LineChart data={chartRows}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="time" tick={{ fontSize: 10 }} unit="s"/><YAxis yAxisId="gaze" domain={[0,1]} tick={{ fontSize: 10 }}/><YAxis yAxisId="pupil" orientation="right" tick={{ fontSize: 10 }}/><Tooltip/><Legend/><Line yAxisId="gaze" dataKey="gazeX" name="Gaze X" stroke="#d97706" dot={false} connectNulls/><Line yAxisId="gaze" dataKey="gazeY" name="Gaze Y" stroke="#f59e0b" dot={false} connectNulls/><Line yAxisId="pupil" dataKey="pupil" name={t('explorer.ocular.pupilSeries', { layer: pupilLayer })} stroke="#7c3aed" dot={false} connectNulls/></LineChart></ResponsiveContainer></div>}
      {pupilOpen && faceArtifactId && <PupilExperimentConsole sessionId={sessionId} faceArtifactId={faceArtifactId} open onOpenChange={setPupilOpen}/>}
    </section>
  );
}

function mergeSeries(gaze: Record<string, unknown>[], pupil: Record<string, unknown>[]) { const rows = [...gaze.map((row) => ({ time: Number(row.source_time_us) / 1e6, gazeX: ocularValue(row,'gaze-x'), gazeY: ocularValue(row,'gaze-y') })), ...pupil.map((row) => ({ time: Number(row.source_time_us) / 1e6, pupil: ocularValue(row,'pupil') }))]; return rows.sort((a,b) => a.time - b.time); }
function gazeHeatmap(rows: Record<string, unknown>[]) { const cells = Array.from({ length: 9 }, () => 0); for (const row of rows) { const x = ocularValue(row,'gaze-x'); const y = ocularValue(row,'gaze-y'); if (x == null || y == null) continue; const col = Math.max(0,Math.min(2,Math.floor(x*3))); const line = Math.max(0,Math.min(2,Math.floor(y*3))); cells[line*3+col] += 1; } return cells; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-black/5 bg-surface p-2"><span className="block text-[10px] uppercase text-text-muted">{label}</span><strong className="tabular-nums">{value}</strong></div>; }
function format(value: unknown, suffix = '') { return typeof value === 'number' ? `${value.toFixed(2)}${suffix}` : '—'; }
function percent(value: unknown) { return typeof value === 'number' ? `${(value*100).toFixed(1)}%` : '—'; }
