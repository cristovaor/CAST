import { Link, useNavigate } from 'react-router-dom';
import { forwardRef, useState, type ButtonHTMLAttributes } from 'react';
import { Video, Activity, Waypoints, Flag, ArrowRight, Camera, Crosshair, FlaskConical } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ToneBadge } from '@/components/ui/ToneBadge';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import { SelectTargetDialog } from '@/features/acquisition/SelectTargetDialog';
import { UploadAssetDialog } from '@/features/acquisition/UploadAssetDialog';
import { LiveCaptureConsole } from '@/features/acquisition/LiveCaptureConsole';
import { LSLAcquisitionConsole } from '@/features/acquisition/LSLAcquisitionConsole';
import { GazeCalibrationConsole } from '@/features/gaze/GazeCalibrationConsole';
import { ContextExperimentConsole } from '@/features/context/ContextExperimentConsole';
import { useSessions } from '@/features/sessions/useSessions';
import { SESSION_STATE_META, type SessionState } from '@/types/research';

// Data acquisition hub (docs §6, §9–10): equivalent entry points for the two
// core modalities plus events, with pending validations surfaced.

export function AcquisitionPage() {
  const navigate = useNavigate();
  const [captureSessionId, setCaptureSessionId] = useState<string | null>(null);
  const [lslSessionId, setLslSessionId] = useState<string | null>(null);
  const [gazeSessionId, setGazeSessionId] = useState<string | null>(null);
  const [contextSessionId, setContextSessionId] = useState<string | null>(null);
  const { data: sessions = [], isLoading } = useSessions();
  const pending = sessions
    .filter((session) => !['approved', 'excluded', 'archived'].includes(session.state ?? 'draft'))
    .slice(0, 8);

  return (
    <div className="min-h-full bg-app-bg pb-12">
      <PageHeader
        title="Aquisição de dados"
        description="Importação e validação de vídeo, EEG e eventos experimentais. As duas modalidades centrais recebem tratamento equivalente."
      />
      <div className="px-6 pt-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-8">
          <UploadAssetDialog kind="video">
            <EntryCard icon={Video} title="Importar vídeo" desc="Formato, codec, fps, face, frames válidos." tone="blue" />
          </UploadAssetDialog>
          <UploadAssetDialog kind="eeg">
            <EntryCard icon={Activity} title="Importar EEG" desc="Canais, montagem, taxa, impedância, artefatos." tone="cyan" />
          </UploadAssetDialog>
          <SelectTargetDialog
            target="session"
            title="Contexto experimental"
            description="Escolha a sessão para editar trials, registrar eventos e importar séries ambientais."
            confirmLabel="Abrir contexto"
            onSelect={(sessionId) => setContextSessionId(sessionId)}
          >
            <EntryCard icon={FlaskConical} title="Contexto" desc="Trials, eventos, CSV/JSONL e ambiente." tone="indigo" />
          </SelectTargetDialog>
          <SelectTargetDialog
            target="session"
            title="Calibrar gaze experimental"
            description="Escolha a sessão e execute o protocolo controlado em tela cheia."
            confirmLabel="Iniciar calibração"
            onSelect={(sessionId) => setGazeSessionId(sessionId)}
          >
            <EntryCard icon={Crosshair} title="Calibrar gaze" desc="Grade 3×3, validação e drift." tone="rose" />
          </SelectTargetDialog>
          <SelectTargetDialog
            target="session"
            title="Capturar vídeo ao vivo"
            description="Escolha a sessão que receberá o vídeo capturado neste navegador."
            confirmLabel="Abrir câmera"
            onSelect={(sessionId) => setCaptureSessionId(sessionId)}
          >
            <EntryCard icon={Camera} title="Capturar ao vivo" desc="Câmera, QA local e envio retomável." tone="emerald" />
          </SelectTargetDialog>
          <SelectTargetDialog
            target="session"
            title="Registrar eventos"
            description="Escolha a sessão para abrir a ferramenta de eventos e anotações."
            confirmLabel="Abrir anotações"
            onSelect={(sessionId) => navigate(`/app/sessions/${sessionId}/annotate`)}
          >
            <EntryCard icon={Flag} title="Importar eventos" desc="Triggers, marcadores e estímulos." tone="amber" />
          </SelectTargetDialog>
          <SelectTargetDialog
            target="session"
            title="Gravar EEG/LSL"
            description="Escolha a sessão e conecte o agente LabRecorder local."
            confirmLabel="Conectar agente"
            onSelect={(sessionId) => setLslSessionId(sessionId)}
          >
            <EntryCard icon={Activity} title="Gravar LSL" desc="Discovery, XDF, markers e checksum." tone="cyan" />
          </SelectTargetDialog>
          <SelectTargetDialog
            target="session"
            title="Sincronizar sessão"
            description="Escolha a sessão cujas fontes serão alinhadas no eixo temporal."
            confirmLabel="Abrir sincronização"
            onSelect={(sessionId) => navigate(`/app/sessions/${sessionId}/sync`)}
          >
            <EntryCard icon={Waypoints} title="Sincronizar" desc="Alinhar fontes no eixo temporal." tone="violet" />
          </SelectTargetDialog>
        </div>

        <ScientificCaveat variant="quality" compact />

        <section className="rounded-xl border border-border bg-surface">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">Validações pendentes</h3>
          </div>
          <ul>
            {isLoading ? (
              <li className="px-4 py-8 text-center text-sm text-text-muted">Carregando sessões…</li>
            ) : pending.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-text-muted">
                Nenhuma validação pendente para as sessões acessíveis.
              </li>
            ) : pending.map((session) => {
              const state = (session.state ?? 'draft') as SessionState;
              const meta = SESSION_STATE_META[state] ?? SESSION_STATE_META.draft;
              const Icon = state === 'ready_to_sync' || state === 'syncing'
                ? Waypoints
                : session.eeg_asset_id && !session.video_asset_id
                  ? Activity
                  : Video;
              const target = state === 'ready_to_sync' || state === 'syncing'
                ? `/app/sessions/${session.id}/sync`
                : `/app/sessions/${session.id}`;
              return (
                <li key={session.id}>
                  <Link to={target} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-surface-hover">
                    <Icon size={16} className="text-text-muted" />
                    <span className="text-sm text-text-primary font-medium">
                      S-{session.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className="text-[13px] text-text-secondary">
                      {session.condition || 'Sessão sem condição informada'}
                    </span>
                    <ToneBadge tone={meta.tone} className="ml-auto">{meta.label}</ToneBadge>
                    <ArrowRight size={14} className="text-text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <LiveCaptureConsole
        sessionId={captureSessionId}
        open={captureSessionId != null}
        onOpenChange={(next) => { if (!next) setCaptureSessionId(null); }}
      />
      <LSLAcquisitionConsole
        sessionId={lslSessionId}
        open={lslSessionId != null}
        onOpenChange={(next) => { if (!next) setLslSessionId(null); }}
      />
      {gazeSessionId && (
        <GazeCalibrationConsole
          sessionId={gazeSessionId}
          open
          onOpenChange={(next) => { if (!next) setGazeSessionId(null); }}
        />
      )}
      {contextSessionId && (
        <ContextExperimentConsole
          sessionId={contextSessionId}
          open
          onOpenChange={(next) => { if (!next) setContextSessionId(null); }}
        />
      )}
    </div>
  );
}

interface EntryCardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: typeof Video;
  title: string;
  desc: string;
  tone: string;
}

const EntryCard = forwardRef<HTMLButtonElement, EntryCardProps>(
  ({ icon: Icon, title, desc, tone, ...props }, ref) => {
  const c: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', cyan: 'bg-cyan-50 text-cyan-600',
    amber: 'bg-amber-50 text-amber-600', violet: 'bg-violet-50 text-violet-600',
    emerald: 'bg-emerald-50 text-emerald-600', rose: 'bg-rose-50 text-rose-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  };
  return (
    <button
      ref={ref}
      type="button"
      className="w-full rounded-xl border border-border bg-surface p-4 text-left hover:border-blue-300 transition-colors"
      {...props}
    >
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center mb-3 ${c[tone]}`}><Icon size={18} /></div>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <p className="text-[12px] text-text-secondary mt-0.5 leading-relaxed">{desc}</p>
    </button>
  );
  },
);
EntryCard.displayName = 'EntryCard';
