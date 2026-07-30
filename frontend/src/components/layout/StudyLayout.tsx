import { NavLink, Outlet, useParams, Link } from 'react-router-dom';
import {
  CalendarClock,
  ChevronRight,
  History,
  Pencil,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudy } from '@/features/studies/useStudies';
import { useProject } from '@/features/projects/useProjects';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EditStudyDialog } from '@/features/studies/EditStudyDialog';
import { EntityHistoryDialog } from '@/features/audit/EntityHistoryDialog';
import { EXPERIMENTAL_DESIGNS, MODALITIES } from '@/types/research';

const DESIGN_LABEL = Object.fromEntries(
  EXPERIMENTAL_DESIGNS.map((design) => [design.value, design.label]),
);
const MODALITY_LABEL = Object.fromEntries(
  MODALITIES.map((modality) => [modality.value, modality.label]),
);

// Contextual navigation inside a study (docs §6). The study header is loaded
// here so every nested page shares the same source of truth.
export function StudyLayout() {
  const { studyId } = useParams();
  const {
    data: study,
    isLoading: isLoadingStudy,
    isError: isStudyError,
  } = useStudy(studyId ?? '');
  const {
    data: project,
    isLoading: isLoadingProject,
  } = useProject(study?.project_id ?? '');
  const base = `/app/studies/${studyId}`;

  const navItems = [
    { name: 'Visão geral', path: `${base}/overview` },
    { name: 'Protocolo', path: `${base}/protocol` },
    { name: 'Hipóteses', path: `${base}/hypotheses` },
    { name: 'Condições', path: `${base}/conditions` },
    { name: 'Variáveis', path: `${base}/variables` },
    { name: 'Participantes', path: `${base}/participants` },
    { name: 'Sessões', path: `${base}/sessions` },
    { name: 'Sincronização', path: `${base}/sync` },
    { name: 'Qualidade', path: `${base}/quality` },
    { name: 'Análises', path: `${base}/analysis` },
    { name: 'Datasets', path: `${base}/datasets` },
    { name: 'Configurações', path: `${base}/settings` },
  ];

  if (isLoadingStudy) {
    return (
      <div className="flex min-h-[320px] items-center justify-center bg-app-bg">
        <div
          className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-blue-600"
          role="status"
          aria-label="Carregando estudo"
        />
      </div>
    );
  }

  if (isStudyError || !study) {
    return (
      <div className="min-h-full bg-app-bg px-6 py-12">
        <div className="mx-auto max-w-lg rounded-xl border border-border bg-surface p-8 text-center">
          <h1 className="text-xl font-semibold text-text-primary">Estudo não encontrado</h1>
          <p className="mt-2 text-sm text-text-muted">
            O estudo informado não existe ou não está disponível para sua organização.
          </p>
          <Link
            to="/app/studies"
            className="mt-5 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Voltar para estudos
          </Link>
        </div>
      </div>
    );
  }

  const designLabel = study.config?.design
    ? DESIGN_LABEL[study.config.design] ?? study.config.design
    : undefined;
  const modalityLabels = (study.config?.modalities ?? []).map(
    (modality) => MODALITY_LABEL[modality] ?? modality,
  );
  const scientificDetails = [
    designLabel ? `Desenho ${designLabel.toLocaleLowerCase('pt-BR')}` : undefined,
    modalityLabels.length > 0 ? modalityLabels.join(' + ') : undefined,
    study.protocol_version ? `Protocolo ${study.protocol_version}` : undefined,
  ].filter((detail): detail is string => Boolean(detail));
  const studySummary = scientificDetails.length > 0
    ? scientificDetails.join(' · ')
    : study.description?.trim() || 'Sem descrição cadastrada';

  const projectLabel = project?.name
    ?? (isLoadingProject ? 'Carregando projeto...' : 'Projeto não encontrado');

  return (
    <div className="min-h-full bg-app-bg">
      <div className="border-b border-border bg-surface px-6 pt-5">
        <nav
          className="mb-3 flex items-center gap-1.5 text-[12px] text-text-muted"
          aria-label="Breadcrumb do estudo"
        >
          <Link to="/app/projects" className="hover:text-text-secondary">Projetos</Link>
          <ChevronRight size={12} aria-hidden="true" />
          {project ? (
            <Link
              to={`/app/projects/${project.id}`}
              className="hover:text-text-secondary"
            >
              {project.name}
            </Link>
          ) : (
            <span>{projectLabel}</span>
          )}
          <ChevronRight size={12} aria-hidden="true" />
          <span className="font-medium text-text-secondary">{study.name}</span>
        </nav>

        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight text-text-primary">
                {study.name}
              </h1>
              <StatusBadge status={study.status} />
            </div>
            <p className="mt-0.5 text-sm text-text-muted">
              {studySummary} · ID {study.id}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[12px] text-text-muted lg:justify-end">
            <span className="mr-2 inline-flex items-center gap-1">
              <Users size={13} aria-hidden="true" />
              {study.participant_count ?? 0} participantes
            </span>
            <span className="mr-2 inline-flex items-center gap-1">
              <CalendarClock size={13} aria-hidden="true" />
              {study.session_count ?? 0} sessões
            </span>
            <EntityHistoryDialog
              entityType="study"
              entityId={study.id}
              title={`Histórico de ${study.name}`}
            >
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition hover:bg-surface-hover"
              >
                <History size={14} aria-hidden="true" />
                Histórico
              </button>
            </EntityHistoryDialog>
            <EditStudyDialog study={study}>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                <Pencil size={14} aria-hidden="true" />
                Editar estudo
              </button>
            </EditStudyDialog>
          </div>
        </div>

        <nav className="mt-4 -mb-px flex gap-6 overflow-x-auto scrollbar-none">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'whitespace-nowrap border-b-2 pb-3 pt-1 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-text-muted hover:border-border-strong hover:text-text-primary',
                )
              }
            >
              {item.name}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="px-6 py-6">
        <Outlet />
      </div>
    </div>
  );
}
