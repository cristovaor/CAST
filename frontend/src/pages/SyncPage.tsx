import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Minus, Plus, RotateCcw, Check, X, Video, Activity, Wand2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ToneBadge } from '@/components/ui/ToneBadge';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import { SYNC_METHODS, SYNC_STATE_META, type SyncMethod, type SyncState, type SyncModel } from '@/types/research';
import { useSync, useUpdateSync, useSyncDecision, useDetectSync } from '@/features/multimodal/useMultimodal';

// Synchronization is a central experience (docs §11): align video, EEG,
// markers and events on one time axis, with anchors, drift and confidence,
// and an explicit approve / invalidate decision with justification.

const DURATION_MS = 744_000;

export function SyncPage() {
  const { sessionId } = useParams();
  const { data: liveSync, isLoading, isError } = useSync(sessionId);
  const updateSync = useUpdateSync(sessionId);
  const decision = useSyncDecision(sessionId);
  const detectSync = useDetectSync(sessionId);

  const sync: SyncModel = {
    state: (liveSync?.state ?? 'not_synced') as SyncState,
    method: liveSync?.method as SyncMethod | undefined,
    offsetMs: liveSync?.offset_ms ?? 0,
    driftMsPerMin: liveSync?.drift_ms_per_min,
    confidence: liveSync?.confidence,
    anchors: (liveSync?.anchors ?? []).map((a, i) => ({ id: `a${i}`, label: a.label, videoTimeMs: a.video_time_ms, eegTimeMs: a.eeg_time_ms })),
    history: (liveSync?.history ?? []).map((h) => ({ at: h.at, by: '—', action: h.action, note: h.note })),
  };

  const [offsetOverride, setOffset] = useState<number | null>(null);
  const [methodOverride, setMethod] = useState<SyncMethod | null>(null);
  const [justification, setJustification] = useState('');
  const offset = offsetOverride ?? sync.offsetMs;
  const method = methodOverride ?? sync.method ?? 'digital_marker';
  const state = SYNC_STATE_META[sync.state];

  const nudge = (d: number) => setOffset((current) => (current ?? sync.offsetMs) + d);
  const persistOffset = () => { if (sessionId && liveSync) updateSync.mutate({ offset_ms: offset, method }); };
  const decide = (approve: boolean) => {
    if (sessionId && liveSync) decision.mutate({ approve, justification });
  };

  if (isLoading) {
    return <div className="p-10 text-center text-sm text-slate-500">Carregando sincronização…</div>;
  }
  if (isError || !liveSync) {
    return <div role="alert" className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Não foi possível carregar a sincronização desta sessão.</div>;
  }

  return (
    <div className="min-h-full bg-slate-50/50 pb-12">
      <PageHeader
        title="Sincronização vídeo & EEG"
        description="Alinhamento das fontes no mesmo eixo temporal. Marcadores, eventos e respostas podem ser ancorados; o drift é corrigido e a decisão é registrada."
        context={
          <>
            <ToneBadge tone={state.tone}>{state.label}</ToneBadge>
            <span className="text-[11px] text-slate-500">Método: {SYNC_METHODS.find((m) => m.value === method)?.label}</span>
            <span className="text-[11px] text-slate-500">Confiança {Math.round((sync.confidence ?? 0) * 100)}%</span>
          </>
        }
        actions={
          <Link to={`/app/sessions/${sessionId}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft size={15} /> Sessão
          </Link>
        }
      />

      <div className="px-6 pt-6 space-y-6">
        <ScientificCaveat variant="association" compact>
          A qualidade da sincronização condiciona toda análise multimodal. Um alinhamento com ressalvas deve ser propagado ao dataset e aos resultados.
        </ScientificCaveat>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Timeline lanes */}
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-800">Eixo temporal</h3>
                <span className="text-[11px] text-slate-400 font-mono">0:00 — 12:24</span>
              </div>

              <SyncLane icon={Video} label="Vídeo" color="#2563EB" offsetMs={0} anchors={sync.anchors.map((a) => a.videoTimeMs)} />
              <SyncLane icon={Activity} label="EEG" color="#0891B2" offsetMs={offset} anchors={sync.anchors.map((a) => a.eegTimeMs)} />

              {/* Anchor markers ruler */}
              <div className="relative h-6 mt-1">
                {sync.anchors.map((a) => (
                  <div key={a.id} className="absolute -translate-x-1/2 flex flex-col items-center" style={{ left: `${(a.videoTimeMs / DURATION_MS) * 100}%` }}>
                    <div className="w-px h-2 bg-slate-300" />
                    <span className="text-[9px] text-slate-400 whitespace-nowrap">{a.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Offset control */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Ajuste de offset (EEG relativo ao vídeo)</h3>
              <div className="flex items-center gap-2">
                {[-1000, -100, -10].map((s) => (
                  <NudgeBtn key={s} onClick={() => nudge(s)}><Minus size={11} />{Math.abs(s)}</NudgeBtn>
                ))}
                <div className="min-w-[7rem] text-center">
                  <span className="text-2xl font-bold tabular-nums text-slate-900">{offset > 0 ? '+' : ''}{offset}</span>
                  <span className="text-slate-400 ml-1">ms</span>
                </div>
                {[10, 100, 1000].map((s) => (
                  <NudgeBtn key={s} onClick={() => nudge(s)}><Plus size={11} />{s}</NudgeBtn>
                ))}
                <button onClick={() => setOffset(null)} className="ml-2 p-2 rounded-md hover:bg-slate-100 text-slate-400" title="Restaurar">
                  <RotateCcw size={14} />
                </button>
                {liveSync && (
                  <button onClick={persistOffset} disabled={updateSync.isPending} className="ml-1 rounded-md bg-slate-900 px-3 py-2 text-[12px] font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                    {updateSync.isPending ? 'Salvando…' : 'Salvar'}
                  </button>
                )}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <Stat label="Drift" value={`${sync.driftMsPerMin ?? '—'} ms/min`} />
                <Stat label="Âncoras" value={String(sync.anchors.length)} />
                <Stat label="Confiança" value={`${Math.round((sync.confidence ?? 0) * 100)}%`} />
              </div>
            </div>
          </div>

          {/* Right controls */}
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Método de sincronização</h3>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as SyncMethod)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {SYNC_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              {liveSync && (
                <button
                  onClick={() => detectSync.mutate()}
                  disabled={detectSync.isPending}
                  className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-[13px] font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                  title="Propõe um offset por correlação cruzada entre eventos faciais e atividade do EEG"
                >
                  <Wand2 size={13} className={detectSync.isPending ? 'animate-pulse' : ''} />
                  {detectSync.isPending ? 'Detectando…' : 'Detectar automaticamente'}
                </button>
              )}
              {detectSync.isError && (
                <p className="mt-1.5 text-[11px] text-red-600">{(detectSync.error as Error).message}</p>
              )}
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => decide(true)}
                  disabled={decision.isPending || (!!liveSync && !justification.trim())}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Check size={14} /> Aprovar
                </button>
                <button
                  onClick={() => decide(false)}
                  disabled={decision.isPending || (!!liveSync && !justification.trim())}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  <X size={14} /> Invalidar
                </button>
              </div>
              <textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Justificativa da decisão (obrigatória)…"
                rows={2}
                className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-[12px] focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Histórico</h3>
              <ol className="space-y-3">
                {sync.history.map((h, i) => (
                  <li key={i} className="relative pl-4 text-[11px]">
                    <span className="absolute left-0 top-1 w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <p className="text-slate-700 font-medium">{h.action}</p>
                    <p className="text-slate-400">{h.by} · {h.at.slice(0, 16).replace('T', ' ')}</p>
                    {h.note && <p className="text-slate-500 italic">{h.note}</p>}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SyncLane({ icon: Icon, label, color, offsetMs, anchors }: {
  icon: typeof Video; label: string; color: string; offsetMs: number; anchors: number[];
}) {
  const pct = (offsetMs / DURATION_MS) * 100;
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="w-16 flex items-center gap-1.5 shrink-0">
        <Icon size={13} style={{ color }} />
        <span className="text-[11px] font-medium text-slate-600">{label}</span>
      </div>
      <div className="relative flex-1 h-9 rounded-md bg-slate-50 border border-slate-100 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 right-0 flex items-center transition-transform"
          style={{ transform: `translateX(${pct}%)` }}
        >
          <div className="h-4 mx-1 flex-1 rounded-sm opacity-30" style={{ backgroundColor: color }} />
        </div>
        {anchors.map((a, i) => (
          <div key={i} className="absolute inset-y-0 w-0.5" style={{ left: `${((a + offsetMs) / DURATION_MS) * 100}%`, backgroundColor: color }} />
        ))}
      </div>
    </div>
  );
}

function NudgeBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-mono text-slate-600 hover:bg-slate-50">
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800 tabular-nums">{value}</p>
    </div>
  );
}
