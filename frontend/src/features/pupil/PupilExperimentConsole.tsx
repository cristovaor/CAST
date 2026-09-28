import { useTranslation } from 'react-i18next';
import { useLocale } from '@/i18n/useLocale';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Eye, Loader2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import { apiClient } from '@/lib/api';
import { parsePupilObservations, type PupilObservationInput } from './pupilImport';

interface PupilRun { id: string; status: string; verdict: string | null; metrics: Record<string, unknown>; error_message?: string | null }

export function PupilExperimentConsole({ sessionId, faceArtifactId, open, onOpenChange }: { sessionId: string; faceArtifactId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation('acquisition');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [observations, setObservations] = useState<PupilObservationInput[]>([]);
  const [environmentArtifactId, setEnvironmentArtifactId] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const run = useQuery({
    queryKey: ['pupil-run', runId], queryFn: () => apiClient.get<PupilRun>(`/pupil-runs/${runId}`), enabled: Boolean(runId),
    refetchInterval: (query) => ['ready','no_go','failed'].includes(query.state.data?.status ?? '') ? false : 1500,
  });
  useEffect(() => {
    if (run.data && ['ready','no_go'].includes(run.data.status)) {
      void queryClient.invalidateQueries({ queryKey: ['explorer-manifest', sessionId] });
    }
  }, [run.data, queryClient, sessionId]);
  const load = async (file?: File) => {
    if (!file) return;
    try { setObservations(parsePupilObservations(await file.text())); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('pupil.errors.invalidFile')); }
  };
  const submit = async () => {
    if (observations.length < 3) return;
    setSubmitting(true); setError(null);
    try {
      const created = await apiClient.post<PupilRun>(`/sessions/${sessionId}/pupil-artifacts`, {
        face_artifact_id: faceArtifactId, environment_artifact_id: environmentArtifactId.trim() || null,
        observations, configuration: { source: 'pupil-experiment-console', webcam_rgb: true },
      });
      setRunId(created.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('pupil.errors.createFailed')); }
    finally { setSubmitting(false); }
  };
  const status = run.data?.status;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl border-border bg-surface text-text-primary"><DialogHeader><DialogTitle>{t('pupil.title')}</DialogTitle><DialogDescription>{t('pupil.description')}</DialogDescription></DialogHeader><div className="space-y-4"><label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface-muted p-6 text-sm"><Upload size={16} aria-hidden="true"/>{t('pupil.import')}<input type="file" className="sr-only" accept=".csv,.json,.jsonl" onChange={(event) => load(event.target.files?.[0])}/></label>{observations.length > 0 && <div className="rounded-lg border border-border p-3 text-xs"><strong>{t('pupil.observations', { count: observations.length, formatted: observations.length.toLocaleString(locale) })}</strong><p className="mt-1 text-text-muted">{t('pupil.range', { from: observations[0].source_time_us, to: observations.at(-1)?.source_time_us, valid: observations.filter((item) => item.valid).length })}</p></div>}<label className="block text-xs">{t('pupil.environmentId')}<input value={environmentArtifactId} onChange={(event) => setEnvironmentArtifactId(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono"/></label><div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><AlertTriangle size={14} className="mr-2 inline" aria-hidden="true"/>{t('pupil.caveat')}</div>{(submitting || (status && !['ready','no_go','failed'].includes(status))) && <div role="status" className="flex gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"><Loader2 size={15} className="animate-spin" aria-hidden="true"/>{t('pupil.processing', { status: status ?? t('pupil.sending') })}</div>}{status && ['ready','no_go'].includes(status) && <div role="status" className="flex gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"><CheckCircle2 size={15} aria-hidden="true"/>{t('pupil.done', { verdict: run.data?.verdict })}</div>}{(error || run.data?.error_message) && <div role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{error ?? run.data?.error_message}</div>}</div><DialogFooter><ActionButton variant="secondary" onClick={() => onOpenChange(false)}>{t('context.close')}</ActionButton><ActionButton variant="primary" disabled={submitting || observations.length < 3} onClick={submit}><Eye size={15} aria-hidden="true"/>{t('pupil.submit')}</ActionButton></DialogFooter></DialogContent></Dialog>;
}
