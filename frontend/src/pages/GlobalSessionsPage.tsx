import { useMemo, useState } from 'react';
import { Activity, AlertCircle, ArrowRight, Plus, Users, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ListFilterBar } from '@/components/data-display/ListFilterBar';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { ToneBadge } from '@/components/ui/ToneBadge';
import { SelectTargetDialog } from '@/features/acquisition/SelectTargetDialog';
import { useSessions } from '@/features/sessions/useSessions';
import { useStudies } from '@/features/studies/useStudies';
import { SESSION_STATE_META, type SessionState } from '@/types/research';

export function GlobalSessionsPage() {
  const navigate = useNavigate();
  const { data: sessions, isLoading, isError } = useSessions();
  const { data: studies = [] } = useStudies();
  const [search, setSearch] = useState('');
  const [studyId, setStudyId] = useState('');
  const [state, setState] = useState('');
  const [modality, setModality] = useState('');

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
    });
  }, [modality, search, sessions, state, studyId, studyNames]);

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

      <div className="space-y-4 p-6">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
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
              <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-muted">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Sessão ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Estudo</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Participante</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Estado</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Data de criação</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Assets</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-secondary">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-surface">
                    {filteredSessions.map((session) => {
                      const stateMeta = session.state
                        ? SESSION_STATE_META[session.state as SessionState]
                        : undefined;
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
                            {session.id.substring(0, 8)}...
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                            {studyNames.get(session.study_id) ?? session.study_id.substring(0, 8)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                            {session.participant_id.substring(0, 8)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4">
                            {stateMeta ? <ToneBadge tone={stateMeta.tone}>{stateMeta.label}</ToneBadge> : '—'}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                            {new Date(session.created_at).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4">
                            <div className="flex gap-2">
                              <span title={session.video_asset_id ? 'Possui vídeo' : 'Sem vídeo'} className={session.video_asset_id ? 'text-blue-500' : 'text-slate-300'}>
                                <Video size={18} />
                              </span>
                              <span title={session.eeg_asset_id ? 'Possui EEG' : 'Sem EEG'} className={session.eeg_asset_id ? 'text-purple-500' : 'text-slate-300'}>
                                <Activity size={18} />
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-right">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                navigate(`/app/sessions/${session.id}`);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
                            >
                              Abrir sessão
                              <ArrowRight size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
