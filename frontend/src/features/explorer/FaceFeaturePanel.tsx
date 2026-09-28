import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api';

interface FaceFeatureSample {
  source_time_us: number;
  valid: boolean;
  quality_flags: string[];
  head_yaw_deg: number | null;
  head_pitch_deg: number | null;
  head_roll_deg: number | null;
  eye_openness_left: number | null;
  eye_openness_right: number | null;
}

export function FaceFeaturePanel({ videoId, artifactId, cursorMs }: {
  videoId: string;
  artifactId: string;
  cursorMs: number;
}) {
  const { t } = useTranslation('analysis');
  const windowStartUs = Math.max(0, Math.round((cursorMs - 5000) * 1000));
  const windowEndUs = Math.round((cursorMs + 5000) * 1000);
  const query = useQuery({
    queryKey: ['face-features', artifactId, windowStartUs, windowEndUs],
    queryFn: () => apiClient.get<{ items: FaceFeatureSample[] }>(
      `/videos/${videoId}/face-features?artifact_id=${artifactId}&start_time_us=${windowStartUs}&end_time_us=${windowEndUs}&limit=1000`,
    ),
  });
  const samples = query.data?.items ?? [];
  const cursorUs = cursorMs * 1000;
  const nearest = samples.reduce<FaceFeatureSample | null>((best, sample) => (
    !best || Math.abs(sample.source_time_us - cursorUs) < Math.abs(best.source_time_us - cursorUs) ? sample : best
  ), null);

  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Activity size={17} className="text-violet-600" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Face Landmarker v2</h2>
          <p className="text-xs text-text-muted">{t('explorer.face.subtitle')}</p>
        </div>
        <span className="ml-auto rounded bg-violet-50 px-2 py-1 text-[9px] font-bold uppercase text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">{t('explorer.face.estimate')}</span>
      </div>
      {query.isLoading ? (
        <div className="flex h-16 items-center justify-center text-xs text-text-secondary"><Loader2 size={15} className="mr-2 animate-spin" aria-hidden="true" />{t('explorer.face.loading')}</div>
      ) : query.isError ? (
        <div role="alert" className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"><AlertTriangle size={15} aria-hidden="true" />{t('explorer.face.failed')}</div>
      ) : nearest ? (
        <div className="grid gap-2 sm:grid-cols-5">
          <Metric label="Yaw" value={angle(nearest.head_yaw_deg)} />
          <Metric label="Pitch" value={angle(nearest.head_pitch_deg)} />
          <Metric label="Roll" value={angle(nearest.head_roll_deg)} />
          <Metric label={t('explorer.face.leftEye')} value={ratio(nearest.eye_openness_left)} />
          <Metric label={t('explorer.face.rightEye')} value={ratio(nearest.eye_openness_right)} />
          {nearest.quality_flags.length > 0 && (
            <p className="col-span-full text-[10px] text-amber-700 dark:text-amber-400">{t('explorer.face.flags', { list: nearest.quality_flags.join(', ') })}</p>
          )}
        </div>
      ) : (
        <p className="rounded-lg bg-surface-muted p-3 text-xs text-text-secondary">{t('explorer.face.noFace')}</p>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-surface-muted p-2"><p className="text-[9px] uppercase text-text-muted">{label}</p><p className="mt-0.5 font-mono text-xs text-text-primary">{value}</p></div>;
}

function angle(value: number | null) { return value == null ? '—' : `${value.toFixed(1)}°`; }
function ratio(value: number | null) { return value == null ? '—' : value.toFixed(2); }
