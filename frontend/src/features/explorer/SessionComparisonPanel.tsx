import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { GitCompareArrows } from 'lucide-react';
import { useSessions } from '@/features/sessions/useSessions';
import { usePlaybackStore } from '@/features/playback/usePlaybackStore';
import { useExplorerManifest } from './useExplorerManifest';
import { compareManifests } from './sessionComparison';
import type { ExplorerManifest } from './types';

export function SessionComparisonPanel({ sessionId, manifest }: { sessionId: string; manifest?: ExplorerManifest }) {
  const { t } = useTranslation('analysis');
  const [otherId, setOtherId] = useState('');
  const sessions = useSessions();
  const other = useExplorerManifest(otherId || undefined);
  const selection = usePlaybackStore((state) => state.selectionMs);
  const comparison = manifest && other.data ? compareManifests(manifest, other.data) : null;
  return <section className="rounded-xl border border-border bg-surface p-4"><div className="flex items-start gap-2"><GitCompareArrows size={17} className="mt-0.5 text-primary" aria-hidden="true"/><div><h2 className="text-sm font-semibold">{t('explorer.compare.title')}</h2><p className="text-xs text-text-muted">{t('explorer.compare.subtitle')}</p></div><select aria-label={t('explorer.compare.choose')} value={otherId} onChange={(event) => setOtherId(event.target.value)} className="ml-auto max-w-xs rounded-lg border border-border bg-surface px-3 py-2 text-xs"><option value="">{t('explorer.compare.choose')}</option>{sessions.data?.filter((item) => item.id !== sessionId).map((item) => <option key={item.id} value={item.id}>{item.id.slice(0,8).toUpperCase()} · {item.condition || t('explorer.compare.noCondition')}</option>)}</select></div>{other.isLoading && <p className="mt-3 text-xs text-text-muted">{t('explorer.compare.loading')}</p>}{comparison && <div className="mt-4 grid gap-3 md:grid-cols-3"><ComparisonCard label={t('explorer.compare.common')} values={comparison.common} tone="emerald"/><ComparisonCard label={t('explorer.compare.onlyCurrent')} values={comparison.onlyLeft} tone="amber"/><ComparisonCard label={t('explorer.compare.onlyOther')} values={comparison.onlyRight} tone="violet"/><p className="md:col-span-3 text-xs text-text-secondary">{t('explorer.compare.summary', {
      window: selection ? `${(selection.startMs/1000).toFixed(2)}–${(selection.endMs/1000).toFixed(2)} s` : t('explorer.compare.useSelection'),
      left: (manifest!.end_time_us/1e6).toFixed(1),
      right: (other.data!.end_time_us/1e6).toFixed(1),
      verdict: comparison.compatible ? t('explorer.compare.compatible') : t('explorer.compare.incompatible'),
    })}</p></div>}</section>;
}

function ComparisonCard({ label, values, tone }: { label: string; values: string[]; tone: 'emerald' | 'amber' | 'violet' }) { const colors = { emerald: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200', amber: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200', violet: 'bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200' }; return <div className={`rounded-lg p-3 ${colors[tone]}`}><p className="text-[10px] font-semibold uppercase">{label}</p><p className="mt-1 text-xs">{values.join(', ') || '—'}</p></div>; }
