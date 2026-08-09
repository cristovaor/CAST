import { AlertTriangle, Boxes, CheckCircle2, Loader2 } from 'lucide-react';
import type { ExplorerManifest, ExplorerTrackDescriptor } from './types';
import { registerExplorerTracks } from './types';

interface ExplorerTrackCatalogProps {
  manifest?: ExplorerManifest;
  loading: boolean;
  error: boolean;
  onSeek: (timeMs: number) => void;
}

export function ExplorerTrackCatalog({
  manifest,
  loading,
  error,
  onSeek,
}: ExplorerTrackCatalogProps) {
  if (loading) {
    return (
      <div className="flex min-h-28 items-center justify-center rounded-xl border border-border bg-surface text-sm text-text-secondary">
        <Loader2 size={17} className="mr-2 animate-spin" /> Carregando catálogo de tracks…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <AlertTriangle size={17} className="mt-0.5 shrink-0" />
        O catálogo não respondeu. Vídeo, EEG e eventos continuam disponíveis pelos módulos independentes.
      </div>
    );
  }

  const registrations = manifest ? registerExplorerTracks(manifest) : [];
  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-sm" data-testid="explorer-track-catalog">
      <div className="mb-3 flex items-start gap-2">
        <Boxes size={17} className="mt-0.5 text-primary" />
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Tracks disponíveis</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            O manifest descreve cada fonte; as amostras permanecem nas APIs de modalidade.
          </p>
        </div>
        <span className="ml-auto rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">
          {registrations.length} tracks
        </span>
      </div>

      {registrations.length === 0 ? (
        <p className="rounded-lg bg-surface-muted p-3 text-xs text-text-secondary">
          Nenhum track materializado nesta sessão.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {registrations.map(({ descriptor }) => (
            <TrackCard key={descriptor.id} track={descriptor} onSeek={onSeek} />
          ))}
        </div>
      )}

      {(manifest?.warnings.length ?? 0) > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-amber-700">
          {manifest?.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
        </ul>
      )}
    </section>
  );
}

function TrackCard({ track, onSeek }: { track: ExplorerTrackDescriptor; onSeek: (timeMs: number) => void }) {
  const quality = summarizeQuality(track.quality_summary);
  return (
    <button
      type="button"
      onClick={() => onSeek(track.start_time_us / 1000)}
      className="rounded-lg border border-border bg-surface-muted p-3 text-left transition-colors hover:border-blue-300"
    >
      <div className="flex items-center gap-2">
        <CheckCircle2 size={14} className="text-emerald-600" />
        <span className="text-xs font-semibold text-text-primary">{track.label}</span>
        {track.experimental && (
          <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-700">experimental</span>
        )}
      </div>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-text-muted">
        {track.modality} · {track.kind} · {formatDuration(track.end_time_us - track.start_time_us)}
      </p>
      <p className="mt-1.5 truncate text-[11px] text-text-secondary" title={quality}>{quality}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {track.capabilities.slice(0, 3).map((capability) => (
          <span key={capability} className="rounded bg-white px-1.5 py-0.5 text-[9px] text-text-muted">
            {capability}
          </span>
        ))}
      </div>
    </button>
  );
}

function summarizeQuality(summary: Record<string, unknown>): string {
  const entries = Object.entries(summary).filter(([, value]) => value != null && typeof value !== 'object');
  if (entries.length === 0) return 'Qualidade sem resumo numérico';
  return entries.slice(0, 2).map(([key, value]) => `${key}: ${String(value)}`).join(' · ');
}

function formatDuration(durationUs: number): string {
  const seconds = Math.max(0, durationUs / 1_000_000);
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
}
