import { Video, Activity, Plus, ChevronRight, User } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useSessions, type SessionListItem } from '@/features/sessions/useSessions';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ToneBadge } from '@/components/ui/ToneBadge';
import { SESSION_STATE_META, type SessionState } from '@/types/research';

// Sessions list inside a study. Shows the real lifecycle state (auto-derived
// server-side), which modalities are attached, and links to the multimodal
// session hub — the state machine is now visible end-to-end.

export function SessionsPage() {
  const { studyId } = useParams();
  const { data: sessions, isLoading } = useSessions(studyId);
  const navigate = useNavigate();

  return (
    <div className="min-h-full">
      <PageHeader
        title="Sessões"
        description="Cada sessão reúne as modalidades de um mesmo período experimental (vídeo, EEG, eventos). O estado é derivado automaticamente dos dados anexados."
        actions={
          <button
            onClick={() => navigate('new')}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={16} />
            Nova sessão
          </button>
        }
      />
      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin" />
          </div>
        ) : !sessions || sessions.length === 0 ? (
          <EmptyState
            variant="empty"
            title="Nenhuma sessão ainda"
            description="Crie a primeira sessão e anexe vídeo e/ou EEG. O estado evolui automaticamente conforme os dados."
            icon={<Video size={40} className="text-slate-300" />}
          />
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionRow({ session }: { session: SessionListItem }) {
  const stateMeta = session.state
    ? SESSION_STATE_META[session.state as SessionState]
    : undefined;

  return (
    <Link
      to={`/app/sessions/${session.id}`}
      className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-blue-300 transition-colors"
    >
      <div className="h-9 w-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
        <User size={16} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">S-{session.id.slice(0, 8)}</span>
          {session.condition && (
            <span className="text-[11px] text-slate-500">· {session.condition}</span>
          )}
        </div>
        <p className="text-[11px] text-slate-400">
          {new Date(session.created_at).toLocaleString('pt-BR')}
        </p>
      </div>

      {/* Modalities present */}
      <div className="flex items-center gap-1.5 shrink-0">
        <ModalityChip present={!!session.video_asset_id} icon={Video} label="Vídeo" tone="blue" />
        <ModalityChip present={!!session.eeg_asset_id} icon={Activity} label="EEG" tone="cyan" />
      </div>

      {stateMeta && <ToneBadge tone={stateMeta.tone}>{stateMeta.label}</ToneBadge>}
      <ChevronRight size={16} className="text-slate-300 shrink-0" />
    </Link>
  );
}

function ModalityChip({ present, icon: Icon, label, tone }: {
  present: boolean; icon: typeof Video; label: string; tone: 'blue' | 'cyan';
}) {
  const cls = present
    ? (tone === 'blue' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-cyan-200 bg-cyan-50 text-cyan-700')
    : 'border-slate-200 bg-slate-50 text-slate-300';
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium ${cls}`} title={present ? `${label} anexado` : `${label} ausente`}>
      <Icon size={11} /> {label}
    </span>
  );
}
