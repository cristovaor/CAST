import { useMemo, useState } from 'react';
import { Activity, ChevronRight, Plus, User, Video } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ListFilterBar } from '@/components/data-display/ListFilterBar';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { ToneBadge } from '@/components/ui/ToneBadge';
import { useSessions, type SessionListItem } from '@/features/sessions/useSessions';
import { SESSION_STATE_META, type SessionState } from '@/types/research';

export function SessionsPage() {
  const { studyId } = useParams();
  const { data: sessions, isLoading } = useSessions(studyId);
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [state, setState] = useState('');
  const [modality, setModality] = useState('');

  const filteredSessions = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return (sessions ?? []).filter((session) => {
      const matchesSearch = !term || [
        session.id,
        session.participant_id,
        session.condition,
      ].some((value) => value?.toLocaleLowerCase('pt-BR').includes(term));
      const matchesState = !state || session.state === state;
      const matchesModality =
        !modality ||
        (modality === 'video' && !!session.video_asset_id) ||
        (modality === 'eeg' && !!session.eeg_asset_id) ||
        (modality === 'both' && !!session.video_asset_id && !!session.eeg_asset_id) ||
        (modality === 'none' && !session.video_asset_id && !session.eeg_asset_id);
      return matchesSearch && matchesState && matchesModality;
    });
  }, [modality, search, sessions, state]);

  return (
    <div className="min-h-full">
      <PageHeader
        title="Sessões"
        description="Cada sessão reúne as modalidades de um mesmo período experimental (vídeo, EEG, eventos). O estado é derivado automaticamente dos dados anexados."
        actions={
          <button
            onClick={() => navigate('new')}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <Plus size={16} />
            Nova sessão
          </button>
        }
      />

      <div className="space-y-4 p-6">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          </div>
        ) : !sessions || sessions.length === 0 ? (
          <EmptyState
            variant="empty"
            title="Nenhuma sessão ainda"
            description="Crie a primeira sessão e anexe vídeo e/ou EEG. O estado evolui automaticamente conforme os dados."
            icon={<Video size={40} className="text-slate-300" />}
          />
        ) : (
          <>
            <ListFilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Buscar por sessão, participante ou condição..."
              resultCount={filteredSessions.length}
              totalCount={sessions.length}
              resultLabel="sessão"
              resultLabelPlural="sessões"
              filters={[
                {
                  id: 'state',
                  label: 'Filtrar por estado',
                  value: state,
                  onChange: setState,
                  options: [
                    { value: '', label: 'Todos os estados' },
                    ...Object.entries(SESSION_STATE_META).map(([value, meta]) => ({
                      value,
                      label: meta.label,
                    })),
                  ],
                },
                {
                  id: 'modality',
                  label: 'Filtrar por modalidade',
                  value: modality,
                  onChange: setModality,
                  options: [
                    { value: '', label: 'Todas as modalidades' },
                    { value: 'video', label: 'Com vídeo' },
                    { value: 'eeg', label: 'Com EEG' },
                    { value: 'both', label: 'Vídeo + EEG' },
                    { value: 'none', label: 'Sem assets' },
                  ],
                },
              ]}
            />

            {filteredSessions.length === 0 ? (
              <EmptyState
                variant="empty"
                title="Nenhuma sessão corresponde aos filtros"
                description="Ajuste a busca ou limpe os filtros para ver outras sessões."
              />
            ) : (
              <div className="space-y-2">
                {filteredSessions.map((session) => (
                  <SessionRow key={session.id} session={session} />
                ))}
              </div>
            )}
          </>
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
      className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-blue-300"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
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

      <div className="flex shrink-0 items-center gap-1.5">
        <ModalityChip present={!!session.video_asset_id} icon={Video} label="Vídeo" tone="blue" />
        <ModalityChip present={!!session.eeg_asset_id} icon={Activity} label="EEG" tone="cyan" />
      </div>

      {stateMeta && <ToneBadge tone={stateMeta.tone}>{stateMeta.label}</ToneBadge>}
      <ChevronRight size={16} className="shrink-0 text-slate-300" />
    </Link>
  );
}

function ModalityChip({ present, icon: Icon, label, tone }: {
  present: boolean;
  icon: typeof Video;
  label: string;
  tone: 'blue' | 'cyan';
}) {
  const className = present
    ? (tone === 'blue'
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : 'border-cyan-200 bg-cyan-50 text-cyan-700')
    : 'border-slate-200 bg-slate-50 text-slate-300';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium ${className}`}
      title={present ? `${label} anexado` : `${label} ausente`}
    >
      <Icon size={11} /> {label}
    </span>
  );
}
