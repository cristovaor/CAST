import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, ArrowRight, CircleCheck, Clock3, Database, Plus, Users, Video } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ListFilterBar } from '@/components/data-display/ListFilterBar';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { PageHeader } from '@/components/layout/PageHeader';
import { ToneBadge } from '@/components/ui/ToneBadge';
import { SelectTargetDialog } from '@/features/acquisition/SelectTargetDialog';
import { useSessions, type SessionListItem } from '@/features/sessions/useSessions';
import { useStudies } from '@/features/studies/useStudies';
import { SESSION_STATE_META, type SessionState } from '@/types/research';

export function GlobalSessionsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: sessions, isLoading, isError } = useSessions();
  const { data: studies = [] } = useStudies();
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [studyId, setStudyId] = useState(() => searchParams.get('study') ?? '');
  const [state, setState] = useState(() => searchParams.get('state') ?? '');
  const [modality, setModality] = useState(() => searchParams.get('modality') ?? '');
  const [sort, setSort] = useState(() => searchParams.get('sort') ?? '');

  const studyNames = useMemo(
    () => new Map(studies.map((study) => [study.id, study.name])),
    [studies],
  );

  const filteredSessions = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return (sessions ?? []).filter((session) => {
      const matchesSearch = !term || [
        session.id,
        session.participant_id,
        session.condition,
        studyNames.get(session.study_id),
      ].some((value) => value?.toLocaleLowerCase('pt-BR').includes(term));
      const matchesStudy = !studyId || session.study_id === studyId;
      const matchesState = !state || session.state === state;
      const matchesModality =
        !modality ||
        (modality === 'video' && !!session.video_asset_id) ||
        (modality === 'eeg' && !!session.eeg_asset_id) ||
        (modality === 'both' && !!session.video_asset_id && !!session.eeg_asset_id) ||
        (modality === 'none' && !session.video_asset_id && !session.eeg_asset_id);
      return matchesSearch && matchesStudy && matchesState && matchesModality;
    }).sort((a, b) => {
      if (sort === 'oldest') return Date.parse(a.created_at) - Date.parse(b.created_at);
      if (sort === 'state') return (a.state ?? '').localeCompare(b.state ?? '', 'pt-BR');
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    });
  }, [modality, search, sessions, sort, state, studyId, studyNames]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (search) next.set('q', search);
    if (studyId) next.set('study', studyId);
    if (state) next.set('state', state);
    if (modality) next.set('modality', modality);
    if (sort) next.set('sort', sort);
    setSearchParams(next, { replace: true });
  }, [modality, search, setSearchParams, sort, state, studyId]);

  const sessionCounts = useMemo(() => {
    const items = sessions ?? [];
    return {
      withData: items.filter((session) => session.video_asset_id || session.eeg_asset_id).length,
      multimodal: items.filter((session) => session.video_asset_id && session.eeg_asset_id).length,
      pending: items.filter((session) => session.state === 'awaiting_data' || session.state === 'draft').length,
    };
  }, [sessions]);

  return (
    <div className="min-h-full">
      <PageHeader
        title="Sessões de Coleta"
        description="Visão geral de todas as sessões experimentais registradas na instituição."
        actions={
          <SelectTargetDialog
            target="study"
            title="Criar sessão"
            description="Escolha o estudo no qual a nova sessão será registrada."
            confirmLabel="Preencher sessão"
            onSelect={(selectedStudyId) => navigate(`/app/studies/${selectedStudyId}/sessions/new`)}
          >
            <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">
              <Plus size={16} />
              Nova Sessão
            </button>
          </SelectTargetDialog>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        {isLoading ? (
          <LoadingState variant="skeleton-table" message="Carregando sessões…" />
        ) : isError ? (
          <EmptyState
            variant="error"
            title="Erro ao carregar"
            description="Não foi possível carregar a lista de sessões."
            icon={<AlertCircle size={40} className="text-red-400" />}
          />
        ) : !sessions || sessions.length === 0 ? (
          <EmptyState
            variant="empty"
            title="Nenhuma sessão cadastrada"
            description="Comece registrando uma nova sessão vinculada a um estudo ativo."
            icon={<Users size={40} className="text-slate-300" />}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SessionMetric icon={Users} label="Total" value={sessions.length} />
              <SessionMetric icon={Database} label="Com dados" value={sessionCounts.withData} tone="info" />
              <SessionMetric icon={Activity} label="Vídeo + EEG" value={sessionCounts.multimodal} tone="success" />
              <SessionMetric icon={Clock3} label="Pendentes" value={sessionCounts.pending} tone="warning" />
            </div>

            <ListFilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Buscar por sessão, participante, condição ou estudo..."
              resultCount={filteredSessions.length}
              totalCount={sessions.length}
              resultLabel="sessão"
              resultLabelPlural="sessões"
              filters={[
                {
                  id: 'study',
                  label: 'Filtrar por estudo',
                  value: studyId,
                  onChange: setStudyId,
                  options: [
                    { value: '', label: 'Todos os estudos' },
                    ...studies.map((study) => ({ value: study.id, label: study.name })),
                  ],
                },
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
                {
                  id: 'sort',
                  label: 'Ordenar sessões',
                  value: sort,
                  onChange: setSort,
                  options: [
                    { value: '', label: 'Mais recentes' },
                    { value: 'oldest', label: 'Mais antigas' },
                    { value: 'state', label: 'Por estado' },
                  ],
                },
              ]}
            />

            {filteredSessions.length === 0 ? (
              <EmptyState
                variant="empty"
                title="Nenhuma sessão corresponde aos filtros"
                description="Ajuste a busca ou limpe os filtros para ver outras sessões."
                icon={<Users size={40} className="text-slate-300" />}
              />
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {filteredSessions.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      studyName={studyNames.get(session.study_id)}
                      onOpen={() => navigate(`/app/sessions/${session.id}`)}
                    />
                  ))}
                </div>

                <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface shadow-sm md:block">
                  <table className="min-w-[1040px] w-full divide-y divide-border">
                    <thead className="bg-surface-muted">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Sessão</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Estudo</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Participante</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Estado</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Data de criação</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Dados</th>
                        <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-secondary">Ação recomendada</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-surface">
                      {filteredSessions.map((session) => {
                        const stateMeta = getSessionStateMeta(session);
                        return (
                          <tr
                            key={session.id}
                            tabIndex={0}
                            onClick={() => navigate(`/app/sessions/${session.id}`)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                navigate(`/app/sessions/${session.id}`);
                              }
                            }}
                            className="cursor-pointer transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                          >
                            <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-text-primary">
                              <span title={session.id}>S-{session.id.substring(0, 8)}</span>
                              {session.condition && <p className="mt-0.5 text-xs font-normal text-text-muted">{session.condition}</p>}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                              {studyNames.get(session.study_id) ?? session.study_id.substring(0, 8)}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                              <span title={session.participant_id}>{session.participant_id.substring(0, 8)}</span>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4">
                              {stateMeta ? <ToneBadge tone={stateMeta.tone}>{stateMeta.label}</ToneBadge> : '—'}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                              {formatSessionDate(session.created_at)}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4">
                              <SessionAssets session={session} />
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-right">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  navigate(`/app/sessions/${session.id}`);
                                }}
                                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
                              >
                                {getSessionActionLabel(session)}
                                <ArrowRight size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SessionMetric({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone?: 'default' | 'info' | 'success' | 'warning';
}) {
  const toneClass = {
    default: 'bg-blue-50 text-blue-700',
    info: 'bg-cyan-50 text-cyan-700',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
  }[tone];

  return (
    <div className="card flex items-center gap-3 p-3 sm:p-4">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
        <Icon size={17} />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-semibold text-text-primary">{value}</p>
        <p className="truncate text-xs text-text-muted">{label}</p>
      </div>
    </div>
  );
}

function SessionCard({
  session,
  studyName,
  onOpen,
}: {
  session: SessionListItem;
  studyName?: string;
  onOpen: () => void;
}) {
  const stateMeta = getSessionStateMeta(session);
  return (
    <article className="card space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Sessão</p>
          <p className="mt-1 font-semibold text-text-primary" title={session.id}>S-{session.id.substring(0, 8)}</p>
          {session.condition && <p className="mt-1 text-xs text-text-secondary">{session.condition}</p>}
        </div>
        {stateMeta && <ToneBadge tone={stateMeta.tone}>{stateMeta.label}</ToneBadge>}
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="col-span-2">
          <dt className="text-xs text-text-muted">Estudo</dt>
          <dd className="mt-0.5 text-text-secondary">{studyName ?? session.study_id.substring(0, 8)}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Participante</dt>
          <dd className="mt-0.5 text-text-secondary" title={session.participant_id}>{session.participant_id.substring(0, 8)}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Criação</dt>
          <dd className="mt-0.5 text-text-secondary">{formatSessionDate(session.created_at)}</dd>
        </div>
      </dl>

      <SessionAssets session={session} labeled />

      <button
        type="button"
        onClick={onOpen}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
      >
        {getSessionActionLabel(session)}
        <ArrowRight size={15} />
      </button>
    </article>
  );
}

function SessionAssets({ session, labeled = false }: { session: SessionListItem; labeled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Dados da sessão">
      <AssetStatus icon={Video} label="Vídeo" present={!!session.video_asset_id} labeled={labeled} />
      <AssetStatus icon={Activity} label="EEG" present={!!session.eeg_asset_id} labeled={labeled} />
    </div>
  );
}

function AssetStatus({
  icon: Icon,
  label,
  present,
  labeled,
}: {
  icon: typeof Video;
  label: string;
  present: boolean;
  labeled: boolean;
}) {
  return (
    <span
      title={present ? `${label} disponível` : `${label} ausente`}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${
        present
          ? 'border-blue-200 bg-blue-50 text-blue-700'
          : 'border-border bg-surface-muted text-text-muted'
      }`}
    >
      {present ? <CircleCheck size={14} /> : <Icon size={14} />}
      {(labeled || present) && `${label} ${present ? 'disponível' : 'ausente'}`}
    </span>
  );
}

function getSessionStateMeta(session: SessionListItem) {
  return session.state ? SESSION_STATE_META[session.state as SessionState] : undefined;
}

function getSessionActionLabel(session: SessionListItem) {
  if (session.state === 'awaiting_data' || session.state === 'draft') return 'Adicionar dados';
  if (session.state === 'review_required') return 'Revisar sessão';
  return 'Abrir sessão';
}

function formatSessionDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR');
}
