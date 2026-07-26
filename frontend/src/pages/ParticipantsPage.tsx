import { useEffect, useMemo, useState } from 'react';
import { CirclePause, Clipboard, History, Pencil, Plus, ShieldAlert, ShieldCheck, UserCheck, Users } from 'lucide-react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ListFilterBar } from '@/components/data-display/ListFilterBar';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { PageHeader } from '@/components/layout/PageHeader';
import { CreateParticipantDialog } from '@/features/participants/CreateParticipantDialog';
import { EditParticipantDialog } from '@/features/participants/EditParticipantDialog';
import { EntityHistoryDialog } from '@/features/audit/EntityHistoryDialog';
import { useParticipants } from '@/features/participants/useParticipants';
import { useStudies } from '@/features/studies/useStudies';
import { cn } from '@/lib/utils';
import type { Participant } from '@/types/domain';

export function ParticipantsPage() {
  const { studyId: routeStudyId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    data: participantsData,
    isLoading,
    isError,
    refetch,
  } = useParticipants();
  const { data: studies = [] } = useStudies();
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [consentStatus, setConsentStatus] = useState(() => searchParams.get('consent') ?? '');
  const [activityStatus, setActivityStatus] = useState(() => searchParams.get('status') ?? '');
  const [selectedStudyId, setSelectedStudyId] = useState(() => searchParams.get('study') ?? '');
  const [sort, setSort] = useState(() => searchParams.get('sort') ?? '');
  const participants = useMemo(() => participantsData?.items ?? [], [participantsData?.items]);
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
      const matchesActivity = !activityStatus
        || (activityStatus === 'active' ? participant.is_active : !participant.is_active);
      return matchesSearch && matchesStudy && matchesConsent && matchesActivity;
    }).sort((a, b) => {
      if (sort === 'code') return a.external_code.localeCompare(b.external_code, 'pt-BR');
      if (sort === 'oldest') return Date.parse(a.created_at) - Date.parse(b.created_at);
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    });
  }, [activityStatus, consentStatus, participants, search, sort, studyId, studyNames]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (search) next.set('q', search);
    if (!routeStudyId && selectedStudyId) next.set('study', selectedStudyId);
    if (consentStatus) next.set('consent', consentStatus);
    if (activityStatus) next.set('status', activityStatus);
    if (sort) next.set('sort', sort);
    setSearchParams(next, { replace: true });
  }, [activityStatus, consentStatus, routeStudyId, search, selectedStudyId, setSearchParams, sort]);

  const consentCounts = useMemo(() => ({
    accepted: participants.filter((participant) => participant.consent_status === 'accepted').length,
    pending: participants.filter((participant) => participant.consent_status === 'pending').length,
    active: participants.filter((participant) => participant.is_active).length,
    inactive: participants.filter((participant) => !participant.is_active).length,
  }), [participants]);

  return (
    <div className="min-h-full">
      <PageHeader
        title="Participantes"
        description="Recrutamento, caracterização da amostra e consentimento com proteção de identidade."
        actions={
          <CreateParticipantDialog>
            <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">
              <Plus size={16} />
              Registrar participante
            </button>
          </CreateParticipantDialog>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        {isLoading ? (
          <LoadingState variant="skeleton-table" message="Carregando participantes…" />
        ) : isError ? (
          <ErrorState
            title="Não foi possível carregar os participantes"
            message="Confira a conexão e tente novamente."
            onRetry={() => { void refetch(); }}
          />
        ) : participants.length === 0 ? (
          <EmptyState
            variant="empty"
            title="Nenhum participante encontrado"
            description="Cadastre participantes para associá-los a sessões e vídeos."
            icon={<Users size={40} className="text-text-disabled" />}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <ParticipantMetric icon={Users} label="Total" value={participants.length} />
              <ParticipantMetric icon={UserCheck} label="Ativos" value={consentCounts.active} tone="success" />
              <ParticipantMetric icon={CirclePause} label="Inativos" value={consentCounts.inactive} />
              <ParticipantMetric icon={ShieldCheck} label="TCLE aceito" value={consentCounts.accepted} tone="success" />
              <ParticipantMetric icon={ShieldAlert} label="Pendentes" value={consentCounts.pending} tone="warning" />
            </div>

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
                  id: 'activity',
                  label: 'Filtrar por situação',
                  value: activityStatus,
                  onChange: setActivityStatus,
                  options: [
                    { value: '', label: 'Ativos e inativos' },
                    { value: 'active', label: 'Ativos' },
                    { value: 'inactive', label: 'Inativos' },
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
                {
                  id: 'sort',
                  label: 'Ordenar participantes',
                  value: sort,
                  onChange: setSort,
                  options: [
                    { value: '', label: 'Mais recentes' },
                    { value: 'oldest', label: 'Mais antigos' },
                    { value: 'code', label: 'Código A–Z' },
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
              <>
                <div className="space-y-3 md:hidden">
                  {filteredParticipants.map((participant) => (
                    <article key={participant.id} className="card space-y-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Código pseudonimizado</p>
                          <p className="mt-1 break-words font-semibold text-text-primary">{participant.external_code}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <ParticipantStatusBadge active={participant.is_active} />
                          <ConsentBadge status={participant.consent_status} />
                        </div>
                      </div>

                      <dl className="grid grid-cols-1 gap-3 text-sm">
                        {!routeStudyId && (
                          <div>
                            <dt className="text-xs text-text-muted">Estudo</dt>
                            <dd className="mt-0.5 text-text-secondary">{studyNames.get(participant.study_id) ?? participant.study_id.slice(0, 8)}</dd>
                          </div>
                        )}
                        <div>
                          <dt className="text-xs text-text-muted">Grupo demográfico</dt>
                          <dd className="mt-0.5 text-text-secondary">{formatDemographicGroup(participant.demographic_group)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-text-muted">Cadastro</dt>
                          <dd className="mt-0.5 text-text-secondary">{formatDate(participant.created_at)}</dd>
                        </div>
                      </dl>

                      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                        <CopyCodeButton code={participant.external_code} />
                        <ParticipantActions participant={participant} labeled />
                      </div>
                    </article>
                  ))}
                </div>

                <div className="card hidden overflow-x-auto md:block">
                  <table className="min-w-[920px] w-full text-left text-sm text-text-secondary">
                    <thead className="border-b border-border bg-surface-muted font-medium text-text-secondary">
                      <tr>
                        <th className="px-6 py-3">Código</th>
                        {!routeStudyId && <th className="px-6 py-3">Estudo</th>}
                        <th className="px-6 py-3">Grupo demográfico</th>
                        <th className="px-6 py-3">Situação</th>
                        <th className="px-6 py-3">Consentimento</th>
                        <th className="px-6 py-3">Data de cadastro</th>
                        <th className="px-6 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredParticipants.map((participant) => (
                        <tr
                          key={participant.id}
                          className={cn(
                            'transition-colors hover:bg-surface-hover',
                            !participant.is_active && 'bg-surface-muted/50',
                          )}
                        >
                          <td className="px-6 py-4 font-medium text-text-primary">
                            <div className="flex items-center gap-1.5">
                              <span>{participant.external_code}</span>
                              <CopyCodeButton code={participant.external_code} compact />
                            </div>
                          </td>
                          {!routeStudyId && (
                            <td className="px-6 py-4">
                              {studyNames.get(participant.study_id) ?? participant.study_id.slice(0, 8)}
                            </td>
                          )}
                          <td className="max-w-xs px-6 py-4">{formatDemographicGroup(participant.demographic_group)}</td>
                          <td className="px-6 py-4"><ParticipantStatusBadge active={participant.is_active} /></td>
                          <td className="px-6 py-4"><ConsentBadge status={participant.consent_status} /></td>
                          <td className="px-6 py-4">{formatDate(participant.created_at)}</td>
                          <td className="px-6 py-4"><ParticipantActions participant={participant} /></td>
                        </tr>
                      ))}
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

function ParticipantMetric({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const toneClass = {
    default: 'bg-blue-50 text-blue-700',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    danger: 'bg-red-50 text-red-700',
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

function ConsentBadge({ status }: { status: Participant['consent_status'] }) {
  const meta = {
    accepted: { label: 'Aceito', className: 'bg-emerald-100 text-emerald-700' },
    pending: { label: 'Pendente', className: 'bg-amber-100 text-amber-700' },
    revoked: { label: 'Revogado', className: 'bg-red-100 text-red-700' },
  }[status];

  return (
    <span className={`inline-flex shrink-0 rounded-full px-2 py-1 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function ParticipantStatusBadge({ active }: { active: boolean }) {
  return (
    <span className={cn(
      'inline-flex shrink-0 rounded-full px-2 py-1 text-xs font-medium',
      active
        ? 'bg-blue-100 text-blue-700'
        : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    )}>
      {active ? 'Ativo' : 'Inativo'}
    </span>
  );
}

function ParticipantActions({ participant, labeled = false }: { participant: Participant; labeled?: boolean }) {
  const buttonClass = labeled
    ? 'inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-muted hover:text-text-primary'
    : 'inline-flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary transition hover:bg-surface-muted hover:text-text-primary';

  return (
    <div className={`flex items-center gap-1 ${labeled ? 'flex-wrap' : 'justify-end'}`}>
      <EditParticipantDialog participant={participant}>
        <button type="button" aria-label="Editar participante" title="Editar participante" className={buttonClass}>
          <Pencil size={16} />
          {labeled && (participant.consent_status === 'pending' ? 'Revisar consentimento' : 'Editar')}
        </button>
      </EditParticipantDialog>
      <EntityHistoryDialog
        entityType="participant"
        entityId={participant.id}
        title={`Histórico de ${participant.external_code}`}
      >
        <button type="button" aria-label="Ver histórico" title="Ver histórico" className={buttonClass}>
          <History size={16} />
          {labeled && 'Histórico'}
        </button>
      </EntityHistoryDialog>
    </div>
  );
}

function CopyCodeButton({ code, compact = false }: { code: string; compact?: boolean }) {
  return (
    <button
      type="button"
      aria-label={`Copiar código ${code}`}
      title="Copiar código"
      onClick={() => { void navigator.clipboard.writeText(code); }}
      className={compact
        ? 'inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition hover:bg-surface-muted hover:text-text-primary'
        : 'inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-muted hover:text-text-primary'}
    >
      <Clipboard size={15} />
      {!compact && 'Copiar código'}
    </button>
  );
}

function formatDemographicGroup(group?: Record<string, unknown>) {
  if (!group || Object.keys(group).length === 0) return 'Não informado';
  return Object.entries(group)
    .map(([key, value]) => `${humanizeKey(key)}: ${String(value)}`)
    .join(' · ');
}

function humanizeKey(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (letter) => letter.toLocaleUpperCase('pt-BR'));
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR');
}
