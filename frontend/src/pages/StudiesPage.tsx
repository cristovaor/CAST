import { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarClock, CheckCircle2, FlaskConical, Plus, Users, Video } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { ListFilterBar } from '@/components/data-display/ListFilterBar';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useProjects } from '@/features/projects/useProjects';
import { useStudies } from '@/features/studies/useStudies';
import type { Study } from '@/types/domain';
import { EXPERIMENTAL_DESIGNS, MODALITIES } from '@/types/research';

const DESIGN_LABEL = Object.fromEntries(EXPERIMENTAL_DESIGNS.map((design) => [design.value, design.label]));
const MODALITY_LABEL = Object.fromEntries(MODALITIES.map((modality) => [modality.value, modality.label]));

export function StudiesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    data: studies = [],
    isLoading,
    isError,
    refetch,
  } = useStudies();
  const { data: projects = [] } = useProjects();
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [projectId, setProjectId] = useState(() => searchParams.get('project') ?? '');
  const [status, setStatus] = useState(() => searchParams.get('status') ?? '');
  const [modality, setModality] = useState(() => searchParams.get('modality') ?? '');
  const [sort, setSort] = useState(() => searchParams.get('sort') ?? '');

  const filteredStudies = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return studies.filter((study) => {
      const matchesSearch = !term || [
        study.name,
        study.description,
        study.config?.researchQuestion,
        study.config?.program,
        study.config?.responsible,
      ].some((value) => value?.toLocaleLowerCase('pt-BR').includes(term));
      const matchesProject = !projectId || study.project_id === projectId;
      const matchesStatus = !status || study.status === status;
      const matchesModality = !modality || study.config?.modalities?.includes(modality);
      return matchesSearch && matchesProject && matchesStatus && matchesModality;
    }).sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'pt-BR');
      if (sort === 'oldest') return Date.parse(a.created_at) - Date.parse(b.created_at);
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    });
  }, [modality, projectId, search, sort, status, studies]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (search) next.set('q', search);
    if (projectId) next.set('project', projectId);
    if (status) next.set('status', status);
    if (modality) next.set('modality', modality);
    if (sort) next.set('sort', sort);
    setSearchParams(next, { replace: true });
  }, [modality, projectId, search, setSearchParams, sort, status]);

  const activeStudies = studies.filter((study) => study.status === 'active').length;
  const totalParticipants = studies.reduce((total, study) => total + (study.participant_count ?? 0), 0);
  const totalSessions = studies.reduce((total, study) => total + (study.session_count ?? 0), 0);

  return (
    <div className="min-h-full">
      <PageHeader
        title="Estudos"
        description="Ambientes científicos configuráveis para análise multimodal sincronizada (vídeo + EEG). Cada estudo define seu próprio desenho, hipóteses e modalidades."
        actions={
          <Link
            to="/app/studies/new"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <Plus size={16} />
            Novo estudo
          </Link>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        {isLoading ? (
          <LoadingState variant="skeleton-cards" rows={3} />
        ) : isError ? (
          <ErrorState
            title="Não foi possível carregar os estudos"
            message="Confira a conexão e tente novamente."
            onRetry={() => { void refetch(); }}
          />
        ) : studies.length === 0 ? (
          <EmptyState
            variant="empty"
            title="Nenhum estudo ainda"
            description="Crie um estudo configurável: defina a questão de pesquisa, o desenho experimental e as modalidades coletadas."
            icon={<FlaskConical size={40} className="text-text-disabled" />}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StudyMetric icon={FlaskConical} label="Estudos" value={studies.length} />
              <StudyMetric icon={CheckCircle2} label="Ativos" value={activeStudies} tone="success" />
              <StudyMetric icon={Users} label="Participantes" value={totalParticipants} tone="info" />
              <StudyMetric icon={CalendarClock} label="Sessões" value={totalSessions} tone="accent" />
            </div>

            <ListFilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Buscar por nome, pergunta, programa ou responsável..."
              resultCount={filteredStudies.length}
              totalCount={studies.length}
              resultLabel="estudo"
              resultLabelPlural="estudos"
              filters={[
                {
                  id: 'project',
                  label: 'Filtrar por projeto',
                  value: projectId,
                  onChange: setProjectId,
                  options: [
                    { value: '', label: 'Todos os projetos' },
                    ...projects.map((project) => ({ value: project.id, label: project.name })),
                  ],
                },
                {
                  id: 'status',
                  label: 'Filtrar por status',
                  value: status,
                  onChange: setStatus,
                  options: [
                    { value: '', label: 'Todos os status' },
                    { value: 'draft', label: 'Rascunho' },
                    { value: 'active', label: 'Ativo' },
                    { value: 'completed', label: 'Concluído' },
                    { value: 'archived', label: 'Arquivado' },
                  ],
                },
                {
                  id: 'modality',
                  label: 'Filtrar por modalidade',
                  value: modality,
                  onChange: setModality,
                  options: [
                    { value: '', label: 'Todas as modalidades' },
                    ...MODALITIES.map((item) => ({ value: item.value, label: item.label })),
                  ],
                },
                {
                  id: 'sort',
                  label: 'Ordenar estudos',
                  value: sort,
                  onChange: setSort,
                  options: [
                    { value: '', label: 'Mais recentes' },
                    { value: 'oldest', label: 'Mais antigos' },
                    { value: 'name', label: 'Nome A–Z' },
                  ],
                },
              ]}
            />

            {filteredStudies.length === 0 ? (
              <EmptyState
                variant="empty"
                title="Nenhum estudo corresponde aos filtros"
                description="Ajuste a busca ou limpe os filtros para ver outros estudos."
                icon={<FlaskConical size={40} className="text-text-disabled" />}
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredStudies.map((study) => (
                  <StudyCard key={study.id} study={study} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StudyCard({ study }: { study: Study }) {
  const config = study.config;
  const design = config?.design ? DESIGN_LABEL[config.design] : undefined;
  const modalities = config?.modalities ?? [];

  return (
    <Link
      to={`/app/studies/${study.id}/overview`}
      className="card card-hover flex flex-col p-5"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="line-clamp-1 font-semibold text-text-primary">{study.name}</h3>
        <StatusBadge status={study.status || 'draft'} />
      </div>

      {config?.researchQuestion ? (
        <p className="line-clamp-2 min-h-[40px] text-sm text-text-secondary">{config.researchQuestion}</p>
      ) : (
        <p className="line-clamp-2 min-h-[40px] text-sm text-text-muted">{study.description || 'Sem descrição'}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {design && (
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-[10.5px] font-medium text-text-secondary">
            <FlaskConical size={11} /> {design}
          </span>
        )}
        {modalities.includes('video') && (
          <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10.5px] font-medium text-blue-700">
            <Video size={11} /> Vídeo
          </span>
        )}
        {modalities.includes('eeg') && (
          <span className="inline-flex items-center gap-1 rounded-md border border-cyan-200 bg-cyan-50 px-1.5 py-0.5 text-[10.5px] font-medium text-cyan-700">
            <Activity size={11} /> EEG
          </span>
        )}
        {modalities.filter((item) => item !== 'video' && item !== 'eeg').slice(0, 2).map((item) => (
          <span key={item} className="rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-[10.5px] font-medium text-text-secondary">
            {MODALITY_LABEL[item] ?? item}
          </span>
        ))}
      </div>

      {config?.responsible && (
        <p className="mt-3 text-xs text-text-muted">
          Responsável: <span className="font-medium text-text-secondary">{config.responsible}</span>
        </p>
      )}

      <StudyReadiness study={study} />

      <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1"><Users size={12} /> {study.participant_count ?? 0}</span>
        <span className="inline-flex items-center gap-1"><CalendarClock size={12} /> {study.session_count ?? 0} sessões</span>
      </div>
    </Link>
  );
}

function StudyMetric({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof FlaskConical;
  label: string;
  value: number;
  tone?: 'default' | 'success' | 'info' | 'accent';
}) {
  const toneClass = {
    default: 'bg-blue-50 text-blue-700',
    success: 'bg-emerald-50 text-emerald-700',
    info: 'bg-cyan-50 text-cyan-700',
    accent: 'bg-violet-50 text-violet-700',
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

function StudyReadiness({ study }: { study: Study }) {
  const config = study.config;
  const checks = [
    !!config?.researchQuestion,
    !!config?.design,
    !!config?.modalities?.length,
    !!config?.responsible,
  ];
  const completed = checks.filter(Boolean).length;
  const percent = Math.round((completed / checks.length) * 100);

  return (
    <div className="mt-4" aria-label={`Configuração científica ${percent}% concluída`}>
      <div className="mb-1.5 flex items-center justify-between text-[11px]">
        <span className="text-text-muted">Configuração científica</span>
        <span className="font-medium text-text-secondary">{percent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
