import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Video, Activity, Flag, ClipboardList, Waypoints, Cpu, PenLine,
  ArrowLeft, Clock, User, FlaskConical, ShieldCheck,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ToneBadge } from '@/components/ui/ToneBadge';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import {
  SESSION_STATE_META, QUALITY_VERDICT_META, SYNC_STATE_META,
  type SessionState, type SyncState, type QualityVerdict,
} from '@/types/research';
import { useSessionDetail, useEEGAsset, useSync } from '@/features/multimodal/useMultimodal';
import { useVideoQualityReport } from '@/features/videos/useVideos';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';

// The session is the hub that gathers every modality from one experimental
// period (docs §8). Modalities are complementary and never all required.
// Every card below reads real backend data when a live session exists —
// mock values are only shown when there is no session id to resolve at all.

function ModalityCard({
  icon: Icon, title, present, children, to, tone,
}: {
  icon: typeof Video; title: string; present: boolean;
  children: React.ReactNode; to?: string; tone?: React.ReactNode;
}) {
  const body = (
    <div className={`rounded-xl border bg-surface p-4 transition-colors ${present ? 'border-border hover:border-blue-300' : 'border-dashed border-border'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${present ? 'bg-blue-50 text-blue-600' : 'bg-surface-muted text-text-muted'}`}>
            <Icon size={16} />
          </div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        </div>
        {tone}
      </div>
      <div className="text-[12px] text-text-muted leading-relaxed">{children}</div>
      {!present && <p className="mt-2 text-[11px] text-text-muted italic">Modalidade opcional — não coletada nesta sessão.</p>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function SessionDetailPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const sessionQuery = useSessionDetail(sessionId);
  const { data: session } = sessionQuery;

  const hasVideo = !!session?.video_asset_id;
  const hasEeg = !!session?.eeg_asset_id;

  // Live modality data — only fetched once the session tells us the asset exists.
  const { data: videoQuality } = useVideoQualityReport(session?.video_asset_id ?? '');
  const { data: eegAsset } = useEEGAsset(session?.eeg_asset_id ?? undefined);
  const { data: liveSync } = useSync(sessionId);

  const sessionState = (session?.state as SessionState) ?? 'draft';
  const syncState = (session?.sync_state as SyncState) ?? 'not_synced';

  const st = SESSION_STATE_META[sessionState];

  // Video card content: real quality-report once assessed, else a neutral
  // "pending" state — never a fabricated number for a real session.
  const videoVerdict = videoQuality?.verdict as QualityVerdict | undefined;
  const vv = videoVerdict ? QUALITY_VERDICT_META[videoVerdict] : null;
  const videoSummary = videoQuality?.assessed
      ? `${videoQuality.width ?? '—'}×${videoQuality.height ?? '—'} · ${videoQuality.fps?.toFixed(1) ?? '—'} fps · ${videoQuality.faceDetectionRate != null ? Math.round(videoQuality.faceDetectionRate * 100) : '—'}% detecção facial`
      : 'Qualidade ainda não avaliada — disponível após o processamento.';

  const eegVerdict = eegAsset?.quality_verdict as QualityVerdict | undefined;
  const ev = eegVerdict ? QUALITY_VERDICT_META[eegVerdict] : null;
  const eegSummary = eegAsset
      ? `${eegAsset.channel_count ?? eegAsset.channel_names.length ?? '—'} canais · ${eegAsset.sample_rate_hz ?? '—'} Hz · ${eegAsset.valid_ratio != null ? Math.round(eegAsset.valid_ratio * 100) : '—'}% válido`
      : 'Aguardando processamento do arquivo.';

  const sy = SYNC_STATE_META[syncState];
  const syncSummary = liveSync
      ? `Offset ${liveSync.offset_ms} ms${liveSync.drift_ms_per_min != null ? ` · drift ${liveSync.drift_ms_per_min} ms/min` : ''}${liveSync.confidence != null ? ` · confiança ${Math.round(liveSync.confidence * 100)}%` : ''}`
      : 'Sincronização ainda não iniciada.';

  // Placed after every hook call so hook order stays stable across renders.
  if (sessionQuery.isLoading) {
    return (
      <div className="min-h-full bg-app-bg pb-12">
        <PageHeader title="Sessão" description="Carregando dados da sessão..." />
        <LoadingState message="Carregando sessão..." />
      </div>
    );
  }

  if (sessionQuery.isError || !session) {
    return (
      <div className="min-h-full bg-app-bg pb-12">
        <PageHeader title="Sessão" description="Dados multimodais do período experimental." />
        <ErrorState
          title="Não foi possível carregar a sessão"
          message={
            sessionQuery.error instanceof Error
              ? sessionQuery.error.message
              : 'A sessão pode ter sido removida ou você não tem acesso a ela.'
          }
          onRetry={() => { void sessionQuery.refetch(); }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-app-bg pb-12">
      <PageHeader
        title={`Sessão ${sessionId ? sessionId.slice(0, 8) : '—'}`}
        description="Reúne todos os dados do mesmo período experimental. As modalidades são complementares; testes e questionários são opcionais."
        context={
          <>
            <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted"><User size={12} /> {session?.participant_id.slice(0, 8) ?? '—'} (pseudonimizado)</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted"><FlaskConical size={12} /> {session?.protocol ?? 'Sem protocolo'}</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted"><Clock size={12} /> {session?.recorded_at ? new Date(session.recorded_at).toLocaleString('pt-BR') : 'Sem data de coleta'}</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">Condição: {session?.condition ?? 'Não informada'}</span>
          </>
        }
        actions={
          <Link to="/app/sessions" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary">
            <ArrowLeft size={15} /> Sessões
          </Link>
        }
      />

      <div className="px-6 pt-6 space-y-6">
        <ScientificCaveat variant="privacy" compact />

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-3">Modalidades</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ModalityCard
              icon={Video} title="Vídeo" present={hasVideo}
              to={hasVideo ? `/app/videos/${session?.video_asset_id ?? `v-${sessionId}`}` : undefined}
              tone={vv ? <ToneBadge tone={vv.tone}>{vv.label}</ToneBadge> : undefined}
            >
              {videoSummary}
            </ModalityCard>

            <ModalityCard
              icon={Activity} title="EEG" present={hasEeg} to={hasEeg ? `/app/sessions/${sessionId}/eeg` : undefined}
              tone={ev ? <ToneBadge tone={ev.tone}>{ev.label}</ToneBadge> : undefined}
            >
              {eegSummary}
            </ModalityCard>

            <ModalityCard
              icon={Waypoints} title="Sincronização" present to={`/app/sessions/${sessionId}/sync`}
              tone={<ToneBadge tone={sy.tone}>{sy.label}</ToneBadge>}
            >
              {syncSummary}
            </ModalityCard>

            <ModalityCard icon={Flag} title="Eventos experimentais" present={!!eegAsset?.event_count}>
              {`${eegAsset?.event_count ?? 0} marcadores registrados`}
            </ModalityCard>

            <ModalityCard icon={ClipboardList} title="Testes / questionários" present={false}>
              Fonte de dados opcional.
            </ModalityCard>

            <ModalityCard icon={PenLine} title="Anotações humanas" present to={`/app/sessions/${sessionId}/annotate`}>
              Abrir ferramenta de anotação.
            </ModalityCard>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <button
            onClick={() => navigate(`/app/sessions/${sessionId}/sync`)}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left hover:border-blue-300 transition-colors"
          >
            <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Waypoints size={17} /></div>
            <div>
              <p className="text-sm font-semibold text-text-primary">Sincronizar vídeo & EEG</p>
              <p className="text-[11px] text-text-muted">Alinhar fontes no mesmo eixo temporal.</p>
            </div>
          </button>
          <button
            onClick={() => navigate(`/app/sessions/${sessionId}/analysis`)}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left hover:border-blue-300 transition-colors"
          >
            <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><Cpu size={17} /></div>
            <div>
              <p className="text-sm font-semibold text-text-primary">Workspace de análise</p>
              <p className="text-[11px] text-text-muted">Explorar séries sincronizadas.</p>
            </div>
          </button>
          <button
            onClick={() => navigate('/app/governance')}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left hover:border-blue-300 transition-colors"
          >
            <div className="h-9 w-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><ShieldCheck size={17} /></div>
            <div>
              <p className="text-sm font-semibold text-text-primary">Consentimento & auditoria</p>
              <p className="text-[11px] text-text-muted">Verificar finalidade e retenção.</p>
            </div>
          </button>
        </section>
      </div>
    </div>
  );
}
