import { useMemo, useState } from 'react';
import { History, Pencil, Plus, Users } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { ListFilterBar } from '@/components/data-display/ListFilterBar';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { CreateParticipantDialog } from '@/features/participants/CreateParticipantDialog';
import { EditParticipantDialog } from '@/features/participants/EditParticipantDialog';
import { EntityHistoryDialog } from '@/features/audit/EntityHistoryDialog';
import { useParticipants } from '@/features/participants/useParticipants';
import { useStudies } from '@/features/studies/useStudies';

export function ParticipantsPage() {
  const { studyId: routeStudyId } = useParams();
  const { data: participantsData, isLoading } = useParticipants();
  const { data: studies = [] } = useStudies();
  const [search, setSearch] = useState('');
  const [consentStatus, setConsentStatus] = useState('');
  const [selectedStudyId, setSelectedStudyId] = useState('');
  const participants = participantsData?.items ?? [];
  const studyId = routeStudyId ?? selectedStudyId;

  const studyNames = useMemo(
    () => new Map(studies.map((study) => [study.id, study.name])),
    [studies],
  );

  const filteredParticipants = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return participants.filter((participant) => {
      const matchesSearch = !term || [
        participant.external_code,
        participant.id,
        studyNames.get(participant.study_id),
        participant.demographic_group ? JSON.stringify(participant.demographic_group) : '',
      ].some((value) => value?.toLocaleLowerCase('pt-BR').includes(term));
      const matchesStudy = !studyId || participant.study_id === studyId;
      const matchesConsent = !consentStatus || participant.consent_status === consentStatus;
      return matchesSearch && matchesStudy && matchesConsent;
    });
  }, [consentStatus, participants, search, studyId, studyNames]);

  return (
    <div className="min-h-full">
      <PageHeader
        title="Participantes"
        description="Gerenciamento de participantes, metadados e consentimentos (LGPD)."
        actions={
          <CreateParticipantDialog>
            <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">
              <Plus size={16} />
              Cadastrar
            </button>
          </CreateParticipantDialog>
        }
      />

      <div className="space-y-4 p-6">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-blue-600" />
          </div>
        ) : participants.length === 0 ? (
          <EmptyState
            variant="empty"
            title="Nenhum participante encontrado"
            description="Cadastre participantes para associá-los a sessões e vídeos."
            icon={<Users size={40} className="text-text-disabled" />}
          />
        ) : (
          <>
            <ListFilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Buscar por código, estudo ou metadado..."
              resultCount={filteredParticipants.length}
              totalCount={participants.length}
              resultLabel="participante"
              resultLabelPlural="participantes"
              filters={[
                {
                  id: 'study',
                  label: 'Filtrar por estudo',
                  value: studyId,
                  onChange: setSelectedStudyId,
                  disabled: !!routeStudyId,
                  options: [
                    { value: '', label: 'Todos os estudos' },
                    ...studies.map((study) => ({ value: study.id, label: study.name })),
                  ],
                },
                {
                  id: 'consent',
                  label: 'Filtrar por consentimento',
                  value: consentStatus,
                  onChange: setConsentStatus,
                  options: [
                    { value: '', label: 'Todos os consentimentos' },
                    { value: 'accepted', label: 'Aceito' },
                    { value: 'pending', label: 'Pendente' },
                    { value: 'revoked', label: 'Revogado' },
                  ],
                },
              ]}
            />

            {filteredParticipants.length === 0 ? (
              <EmptyState
                variant="empty"
                title="Nenhum participante corresponde aos filtros"
                description="Ajuste a busca ou limpe os filtros para ver outros participantes."
                icon={<Users size={40} className="text-text-disabled" />}
              />
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full text-left text-sm text-text-secondary">
                  <thead className="border-b border-border bg-surface-muted font-medium text-text-secondary">
                    <tr>
                      <th className="px-6 py-3">Código</th>
                      {!routeStudyId && <th className="px-6 py-3">Estudo</th>}
                      <th className="px-6 py-3">Grupo demográfico</th>
                      <th className="px-6 py-3">Consentimento</th>
                      <th className="px-6 py-3">Data de cadastro</th>
                      <th className="px-6 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredParticipants.map((participant) => (
                      <tr key={participant.id} className="transition-colors hover:bg-surface-hover">
                        <td className="px-6 py-4 font-medium text-text-primary">{participant.external_code}</td>
                        {!routeStudyId && (
                          <td className="px-6 py-4">
                            {studyNames.get(participant.study_id) ?? participant.study_id.slice(0, 8)}
                          </td>
                        )}
                        <td className="px-6 py-4">
                          {participant.demographic_group ? JSON.stringify(participant.demographic_group) : '—'}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                            participant.consent_status === 'accepted'
                              ? 'bg-emerald-100 text-emerald-700'
                              : participant.consent_status === 'pending'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-red-100 text-red-700'
                          }`}>
                            {participant.consent_status === 'accepted'
                              ? 'Aceito'
                              : participant.consent_status === 'pending'
                                ? 'Pendente'
                                : 'Revogado'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {new Date(participant.created_at).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <EditParticipantDialog participant={participant}>
                              <button
                                type="button"
                                title="Editar participante"
                                className="rounded-lg p-2 text-text-secondary transition hover:bg-blue-50 hover:text-blue-600"
                              >
                                <Pencil size={15} />
                              </button>
                            </EditParticipantDialog>
                            <EntityHistoryDialog
                              entityType="participant"
                              entityId={participant.id}
                              title={`Histórico de ${participant.external_code}`}
                            >
                              <button
                                type="button"
                                title="Ver histórico"
                                className="rounded-lg p-2 text-text-secondary transition hover:bg-surface-muted hover:text-text-primary"
                              >
                                <History size={15} />
                              </button>
                            </EntityHistoryDialog>
                          </div>
                        </td>
                      </tr>
                    ))}
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
