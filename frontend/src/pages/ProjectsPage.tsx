import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, LayoutGrid, List, Search, Filter, ChevronDown,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProjectCard } from '@/components/domain/ProjectCard';
import { DataTable, type ColumnDef } from '@/components/data-display/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { QualityBadge } from '@/components/ui/QualityBadge';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { cn, scoreToQuality } from '@/lib/utils';
import { formatRelativeTime, formatNumber } from '@/lib/formatters';
import {
  useArchiveProject,
  useDeleteProject,
  useProjects,
} from '@/features/projects/useProjects';
import { CreateProjectDialog } from '@/features/projects/CreateProjectDialog';
import { EditProjectDialog } from '@/features/projects/EditProjectDialog';
import type { Project, StudyStatus, ViewMode } from '@/types/domain';

// ─── Filter types ─────────────────────────────────────────────

interface Filters {
  status: StudyStatus | 'all';
  search: string;
}

// ─── Table columns ────────────────────────────────────────────

const TABLE_COLUMNS: ColumnDef<Project>[] = [
  {
    key: 'name',
    header: 'Projeto',
    sortable: true,
    render: (_, row) => (
      <div>
        <div className="text-[13px] font-semibold text-text-primary line-clamp-1">{row.name}</div>
        {row.description && (
          <div className="text-[11px] text-text-muted line-clamp-1 mt-0.5">{row.description}</div>
        )}
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    render: (_, row) => row.status ? <StatusBadge status={row.status} size="sm" /> : '—',
  },
  {
    key: 'study_count',
    header: 'Estudos',
    align: 'center',
    sortable: true,
    render: (v) => <span className="text-sm font-semibold text-text-primary">{formatNumber(Number(v ?? 0))}</span>,
  },
  {
    key: 'session_count',
    header: 'Sessões',
    align: 'center',
    sortable: true,
    render: (v) => <span className="text-sm font-semibold text-text-primary">{formatNumber(Number(v ?? 0))}</span>,
  },
  {
    key: 'video_count',
    header: 'Vídeos',
    align: 'center',
    sortable: true,
    render: (v) => <span className="text-sm font-semibold text-text-primary">{formatNumber(Number(v ?? 0))}</span>,
  },
  {
    key: 'average_quality',
    header: 'Qualidade',
    sortable: true,
    render: (_, row) => row.average_quality
      ? <QualityBadge level={scoreToQuality(row.average_quality)} score={row.average_quality} size="sm" />
      : <span className="text-xs text-text-muted">—</span>,
  },
  {
    key: 'last_activity',
    header: 'Última atividade',
    sortable: true,
    render: (v) => v
      ? <span className="text-xs text-text-secondary">{formatRelativeTime(String(v))}</span>
      : <span className="text-xs text-text-muted">—</span>,
  },
  {
    key: 'responsible',
    header: 'Responsáveis',
    render: (_, row) => (
      <div className="flex -space-x-1.5">
        {(row.responsible ?? []).slice(0, 3).map((u) => (
          <div
            key={u.id}
            className="w-6 h-6 rounded-full ring-2 ring-surface bg-blue-100 flex items-center justify-center"
            title={u.name}
          >
            {u.avatar_url
              ? <img src={u.avatar_url} alt={u.name} className="w-full h-full rounded-full object-cover" />
              : <span className="text-[8px] font-bold text-blue-700">{u.name.slice(0,2).toUpperCase()}</span>
            }
          </div>
        ))}
      </div>
    ),
  },
];

// ─── Projects Page ────────────────────────────────────────────

export function ProjectsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filters, setFilters] = useState<Filters>({
    status: 'all',
    search: searchParams.get('search') ?? '',
  });
  const [statusOpen, setStatusOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const { data: projects = [], isLoading } = useProjects();
  const archiveProject = useArchiveProject();
  const deleteProject = useDeleteProject();

  // Filter projects
  const filtered = projects.filter((p) => {
    const matchStatus = filters.status === 'all' || p.status === filters.status;
    const matchSearch = !filters.search ||
      p.name.toLowerCase().includes(filters.search.toLowerCase()) ||
      p.description?.toLowerCase().includes(filters.search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const STATUS_OPTIONS: { value: Filters['status']; label: string }[] = [
    { value: 'all',       label: 'Todos os status' },
    { value: 'active',    label: 'Ativo' },
    { value: 'draft',     label: 'Rascunho' },
    { value: 'completed', label: 'Concluído' },
    { value: 'archived',  label: 'Arquivado' },
  ];

  return (
    <div className="min-h-full bg-app-bg text-text-primary">
      <PageHeader
        title="Projetos de pesquisa"
        description="Organize estudos, sessões, participantes e pipelines de análise de microações faciais."
        actions={
          <CreateProjectDialog>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus size={14} />
              Novo Projeto
            </button>
          </CreateProjectDialog>
        }
      />

      <div className="p-6 space-y-5 animate-fade-in">
        {archiveProject.isError && (
          <p className="text-sm text-red-600" role="alert">
            Não foi possível arquivar o projeto: {(archiveProject.error as Error).message}
          </p>
        )}
        {/* ── Toolbar ──────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="search"
              placeholder="Buscar projetos…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              aria-label="Buscar projetos"
              className="w-full pl-9 pr-4 py-2 text-sm bg-surface rounded-lg border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
            />
          </div>

          {/* Status filter */}
          <div className="relative">
            <button
              onClick={() => setStatusOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-text-secondary bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors"
              aria-label="Filtrar por status"
              aria-expanded={statusOpen}
            >
              <Filter size={13} />
              {STATUS_OPTIONS.find((o) => o.value === filters.status)?.label}
              <ChevronDown size={13} className="text-text-muted" />
            </button>
            {statusOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setStatusOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-20 w-44 py-1 bg-surface rounded-xl border border-border shadow-dropdown animate-scale-in">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setFilters((f) => ({ ...f, status: opt.value })); setStatusOpen(false); }}
                      className={cn(
                        'flex items-center justify-between w-full px-3 py-2 text-sm transition-colors text-left',
                        filters.status === opt.value
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-text-primary hover:bg-surface-hover',
                      )}
                    >
                      {opt.label}
                      {filters.status === opt.value && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex-1" />

          {/* Summary */}
          <span className="text-xs text-text-muted font-medium">
            {filtered.length} projeto{filtered.length !== 1 ? 's' : ''}
          </span>

          {/* View toggle */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden bg-surface">
            <ViewToggleBtn
              active={viewMode === 'grid'}
              icon={<LayoutGrid size={14} />}
              onClick={() => setViewMode('grid')}
              label="Vista em grade"
            />
            <ViewToggleBtn
              active={viewMode === 'table'}
              icon={<List size={14} />}
              onClick={() => setViewMode('table')}
              label="Vista em tabela"
            />
          </div>
        </div>

        {/* ── Content ──────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="w-8 h-8 rounded-full border-4 border-border border-t-blue-600 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            variant={filters.search || filters.status !== 'all' ? 'no-results' : 'empty'}
            title="Nenhum projeto encontrado"
            description={
              filters.search || filters.status !== 'all'
                ? 'Tente ajustar os filtros ou termos de busca.'
                : 'Crie seu primeiro projeto de pesquisa para começar a coletar e analisar dados de microações.'
            }
            action={{ label: 'Novo Projeto', onClick: () => setCreateProjectOpen(true) }}
          />
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <div className="card overflow-hidden">
            <DataTable
              columns={TABLE_COLUMNS}
              data={filtered}
              onRowClick={(row) => navigate(`/app/projects/${row.id}`)}
              rowActions={(row) => [
                { label: 'Abrir projeto', onClick: () => navigate(`/app/projects/${row.id}`) },
                { label: 'Editar', onClick: () => setProjectToEdit(row) },
                ...(row.status !== 'archived'
                  ? [{
                      label: 'Arquivar',
                      onClick: () => archiveProject.mutate(row.id),
                    }]
                  : []),
                {
                  label: 'Excluir',
                  onClick: () => {
                    deleteProject.reset();
                    setProjectToDelete(row);
                  },
                  destructive: true,
                },
              ]}
              emptyState={
                <EmptyState variant="no-results" title="Nenhum projeto" />
              }
            />
          </div>
        )}
      </div>

      {projectToEdit && (
        <EditProjectDialog
          project={projectToEdit}
          open
          onOpenChange={(open) => {
            if (!open) setProjectToEdit(null);
          }}
        />
      )}

      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
      />

      <ConfirmDialog
        open={projectToDelete !== null}
        onClose={() => {
          if (!deleteProject.isPending) setProjectToDelete(null);
        }}
        onConfirm={() => {
          if (!projectToDelete) return;
          deleteProject.mutate(projectToDelete.id, {
            onSuccess: () => setProjectToDelete(null),
          });
        }}
        title="Excluir projeto"
        description={
          <>
            <span>
              Esta ação exclui permanentemente o projeto “{projectToDelete?.name}”.
              Projetos que possuem estudos devem ser arquivados.
            </span>
            {deleteProject.isError && (
              <span className="block mt-2 text-red-600" role="alert">
                {(deleteProject.error as Error).message}
              </span>
            )}
          </>
        }
        confirmLabel="Excluir"
        destructive
        isLoading={deleteProject.isPending}
      />
    </div>
  );
}

function ViewToggleBtn({
  active, icon, onClick, label,
}: {
  active: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'p-2 transition-colors',
        active ? 'bg-surface-muted text-text-primary' : 'text-text-muted hover:text-text-secondary',
      )}
    >
      {icon}
    </button>
  );
}
