import { useState } from 'react';
import { GitCompareArrows } from 'lucide-react';
import { useSessions } from '@/features/sessions/useSessions';
import { usePlaybackStore } from '@/features/playback/usePlaybackStore';
import { useExplorerManifest } from './useExplorerManifest';
import { compareManifests } from './sessionComparison';
import type { ExplorerManifest } from './types';

export function SessionComparisonPanel({ sessionId, manifest }: { sessionId: string; manifest?: ExplorerManifest }) {
  const [otherId, setOtherId] = useState('');
  const sessions = useSessions();
  const other = useExplorerManifest(otherId || undefined);
  const selection = usePlaybackStore((state) => state.selectionMs);
  const comparison = manifest && other.data ? compareManifests(manifest, other.data) : null;
  return <section className="rounded-xl border border-border bg-surface p-4"><div className="flex items-start gap-2"><GitCompareArrows size={17} className="mt-0.5 text-primary"/><div><h2 className="text-sm font-semibold">Comparar sessões</h2><p className="text-xs text-text-muted">Comparação descritiva; nenhuma inferência automática entre grupos.</p></div><select value={otherId} onChange={(event) => setOtherId(event.target.value)} className="ml-auto max-w-xs rounded-lg border border-border bg-surface px-3 py-2 text-xs"><option value="">Escolha outra sessão</option>{sessions.data?.filter((item) => item.id !== sessionId).map((item) => <option key={item.id} value={item.id}>{item.id.slice(0,8).toUpperCase()} · {item.condition || 'sem condição'}</option>)}</select></div>{other.isLoading && <p className="mt-3 text-xs text-text-muted">Carregando manifest comparável…</p>}{comparison && <div className="mt-4 grid gap-3 md:grid-cols-3"><ComparisonCard label="Modalidades comuns" values={comparison.common} tone="emerald"/><ComparisonCard label="Somente sessão atual" values={comparison.onlyLeft} tone="amber"/><ComparisonCard label="Somente comparada" values={comparison.onlyRight} tone="violet"/><p className="md:col-span-3 text-xs text-text-secondary">Janela: {selection ? `${(selection.startMs/1000).toFixed(2)}–${(selection.endMs/1000).toFixed(2)} s` : 'use a seleção do Explorer'} · durações {(manifest!.end_time_us/1e6).toFixed(1)} s × {(other.data!.end_time_us/1e6).toFixed(1)} s · {comparison.compatible ? 'compatível para inspeção das modalidades comuns' : 'sem modalidade comum'}</p></div>}</section>;
}

function ComparisonCard({ label, values, tone }: { label: string; values: string[]; tone: 'emerald' | 'amber' | 'violet' }) { const colors = { emerald: 'bg-emerald-50 text-emerald-800', amber: 'bg-amber-50 text-amber-800', violet: 'bg-violet-50 text-violet-800' }; return <div className={`rounded-lg p-3 ${colors[tone]}`}><p className="text-[10px] font-semibold uppercase">{label}</p><p className="mt-1 text-xs">{values.join(', ') || '—'}</p></div>; }
