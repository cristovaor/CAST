import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, Database, Download, Scissors } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiClient } from '@/lib/api';
import { usePlaybackStore } from '@/features/playback/usePlaybackStore';
import type { ExplorerManifest } from './types';

export function ExplorerIntervalActions({ sessionId, manifest }: { sessionId: string; manifest?: ExplorerManifest }) {
  const cursorMs = usePlaybackStore((state) => state.currentTimeMs);
  const durationMs = usePlaybackStore((state) => state.durationMs);
  const selection = usePlaybackStore((state) => state.selectionMs);
  const setSelection = usePlaybackStore((state) => state.setSelectionMs);
  const [message, setMessage] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const exportJob = useQuery({
    queryKey: ['explorer-export', sessionId, jobId],
    queryFn: () => apiClient.get<{ status: string; download_url?: string; checksum_sha256?: string; error?: string }>(`/sessions/${sessionId}/explorer-exports/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (query) => ['SUCCESS','FAILURE'].includes(query.state.data?.status ?? '') ? false : 1500,
  });
  const selectAroundCursor = () => setSelection({ startMs: Math.max(0, cursorMs - 5000), endMs: Math.min(durationMs || cursorMs + 5000, cursorMs + 5000) });
  const exportInterval = async () => {
    if (!selection) return selectAroundCursor();
    const result = await apiClient.post<{ job_id: string }>(`/sessions/${sessionId}/explorer-exports`, {
      start_time_us: Math.round(selection.startMs * 1000), end_time_us: Math.round(selection.endMs * 1000),
      track_ids: manifest?.tracks.map((track) => track.id) ?? [], format: 'json',
    });
    setJobId(result.job_id);
    setMessage(`Exportação enfileirada: ${result.job_id.slice(0, 8).toUpperCase()}`);
  };
  const captureFigure = () => {
    if (!selection) return selectAroundCursor();
    const tracks = manifest?.tracks.map((track, index) => `<text x="24" y="${90 + index * 22}" font-size="12">${escapeXml(track.label)} · ${escapeXml(track.modality)}</text>`).join('') ?? '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="${Math.max(180, 120 + (manifest?.tracks.length ?? 0) * 22)}"><rect width="100%" height="100%" fill="#fff"/><text x="24" y="34" font-size="20" font-family="sans-serif">CAST · intervalo multimodal</text><text x="24" y="58" font-size="12" font-family="monospace">${(selection.startMs / 1000).toFixed(3)}s — ${(selection.endMs / 1000).toFixed(3)}s</text><g font-family="sans-serif" fill="#334155">${tracks}</g></svg>`;
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `cast-interval-${sessionId.slice(0, 8)}.svg`);
    setMessage('Figura SVG criada com o intervalo e os tracks visíveis.');
  };
  return (
    <section className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3" aria-label="Ações do intervalo selecionado">
      <button type="button" onClick={selectAroundCursor} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-semibold"><Scissors size={14}/>Selecionar ±5 s</button>
      <button type="button" onClick={exportInterval} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white"><Download size={14}/>Exportar intervalo</button>
      <button type="button" onClick={captureFigure} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-semibold"><Camera size={14}/>Capturar figura</button>
      <Link to="/app/datasets" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-semibold"><Database size={14}/>Criar dataset derivado</Link>
      {exportJob.data?.download_url && <a href={exportJob.data.download_url} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"><Download size={14}/>Baixar exportação</a>}
      <span className="ml-auto text-[11px] text-text-muted">{selection ? `${(selection.startMs / 1000).toFixed(2)}–${(selection.endMs / 1000).toFixed(2)} s` : 'Nenhum intervalo selecionado'}</span>
      {message && <p role="status" className="w-full text-xs text-emerald-700">{message}</p>}
      {jobId && !exportJob.data?.download_url && <p className="w-full text-xs text-blue-700">Job {jobId.slice(0,8).toUpperCase()}: {exportJob.data?.status ?? 'PENDING'}{exportJob.data?.error ? ` · ${exportJob.data.error}` : ''}</p>}
    </section>
  );
}

function downloadBlob(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
function escapeXml(value: string) { return value.replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char] ?? char); }
