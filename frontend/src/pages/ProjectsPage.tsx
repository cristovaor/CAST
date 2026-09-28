import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
import { cn, scoreToQuality } from '@/lib/utils';
import { formatRelativeTime, formatNumber, statusLabel } from '@/lib/formatters';
import {
  useArchiveProject,
  useProjects,
} from '@/features/projects/useProjects';
import { CreateProjectDialog } from '@/features/projects/CreateProjectDialog';
import { EditProjectDialog } from '@/features/projects/EditProjectDialog';
import { DeleteEntityDialog } from '@/features/deletion/DeleteEntityDialog';
import { useMe } from '@/features/auth/useAuth';
import type { Project, StudyStatus, ViewMode } from '@/types/domain';

// ─── Filter types ─────────────────────────────────────────────

interface Filters {
  status: StudyStatus | 'all';
  search: string;
}

// ─── Table columns ────────────────────────────────────────────

function projectColumns(t: TFunction<'projects'>): ColumnDef<Project>[] {
  return [
  {
    key: 'name',
    header: t('columns.project'),
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
    header: t('columns.status'),
    sortable: true,
    render: (_, row) => row.status ? <StatusBadge status={row.status} size="sm" /> : '—',
  },
  {
    key: 'study_count',
    header: t('columns.studies'),
    align: 'center',
    sortable: true,
    render: (v) => <span className="text-sm font-semibold text-text-primary">{formatNumber(Number(v ?? 0))}</span>,
  },
  {
    key: 'session_count',
    header: t('columns.sessions'),
    align: 'center',
    sortable: true,
    render: (v) => <span className="text-sm font-semibold text-text-primary">{formatNumber(Number(v ?? 0))}</span>,
  },
  {
    key: 'video_count',
    header: t('columns.videos'),
    align: 'center',
    sortable: true,
    render: (v) => <span className="text-sm font-semibold text-text-primary">{formatNumber(Number(v ?? 0))}</span>,
  },
  {
    key: 'average_quality',
    header: t('columns.quality'),
    sortable: true,
    render: (_, row) => row.average_quality
      ? <QualityBadge level={scoreToQuality(row.average_quality)} score={row.average_quality} size="sm" />
      : <span className="text-xs text-text-muted">—</span>,
  },
  {
    key: 'last_activity',
    header: t('columns.lastActivity'),
    sortable: true,
    render: (v) => v
      ? <span className="text-xs text-text-secondary">{formatRelativeTime(String(v))}</span>
      : <span className="text-xs text-text-muted">—</span>,
  },
  {
    key: 'responsible',
    header: t('columns.responsible'),
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
}

// ─── Projects Page ────────────────────────────────────────────

export function ProjectsPage() {
  const { t } = useTranslation('projects');
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
  const isAdmin = useMe().data?.role === 'admin';

  // Filter projects
  const filtered = projects.filter((p) => {
    const matchStatus = filters.status === 'all' || p.status === filters.status;
    const matchSearch = !filters.search ||
      p.name.toLowerCase().includes(filters.search.toLowerCase()) ||
      p.description?.toLowerCase().includes(filters.search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const STATUS_OPTIONS: { value: Filters['status']; label: string }[] = [
    { value: 'all',       label: t('allStatuses') },
    { value: 'active',    label: statusLabel('active') },
    { value: 'draft',     label: statusLabel('draft') },
    { value: 'completed', label: statusLabel('completed') },
    { value: 'archived',  label: statusLabel('archived') },
  ];

  return (
    <div className="min-h-full bg-app-bg text-text-primary">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <CreateProjectDialog>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus size={14} aria-hidden="true" />
              {t('newProject')}
            </button>
          </CreateProjectDialog>
        }
      />

      <div className="p-6 space-y-5 animate-fade-in">
        {archiveProject.isError && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {t('archiveFailed', { message: (archiveProject.error as Error).message })}
          </p>
        )}
        {/* ── Toolbar ──────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="search"
              placeholder={t('search')}
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              aria-label={t('searchLabel')}
              className="w-full pl-9 pr-4 py-2 text-sm bg-surface rounded-lg border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
            />
          </div>

          {/* Status filter */}
          <div className="relative">
            <button
              onClick={() => setStatusOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-text-secondary bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors"
              aria-label={t('filterStatus')}
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
                          ? 'bg-blue-50 text-blue-700 font-medium dark:bg-blue-950/50 dark:text-blue-300'
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
            {t('count', { count: filtered.length })}
          </span>

          {/* View toggle */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden bg-surface">
            <ViewToggleBtn
              active={viewMode === 'grid'}
              icon={<LayoutGrid size={14} />}
              onClick={() => setViewMode('grid')}
              label={t('gridView')}
            />
            <ViewToggleBtn
              active={viewMode === 'table'}
              icon={<List size={14} />}
              onClick={() => setViewMode('table')}
              label={t('tableView')}
            />
          </div>
        </div>

        {/* ── Content ──────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div role="status" aria-label={t('loading')} className="w-8 h-8 rounded-full border-4 border-border border-t-blue-600 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            variant={filters.search || filters.status !== 'all' ? 'no-results' : 'empty'}
            title={t('empty.title')}
            description={
              filters.search || filters.status !== 'all'
                ? t('empty.filtered')
                : t('empty.first')
            }
            action={{ label: t('newProject'), onClick: () => setCreateProjectOpen(true) }}
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
              columns={projectColumns(t)}
              data={filtered}
              onRowClick={(row) => navigate(`/app/projects/${row.id}`)}
              rowActions={(row) => [
                { label: t('actions.open'), onClick: () => navigate(`/app/projects/${row.id}`) },
                { label: t('actions.edit'), onClick: () => setProjectToEdit(row) },
                ...(row.status !== 'archived'
                  ? [{
                      label: t('actions.archive'),
                      onClick: () => archiveProject.mutate(row.id),
                    }]
                  : []),
                ...(isAdmin
                  ? [{
                      label: t('actions.delete'),
                      onClick: () => setProjectToDelete(row),
                      destructive: true,
                    }]
                  : []),
              ]}
              emptyState={
                <EmptyState variant="no-results" title={t('empty.table')} />
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

      {projectToDelete && (
        <DeleteEntityDialog
          entityType="project"
          entityId={projectToDelete.id}
          open
          onOpenChange={(open) => {
            if (!open) setProjectToDelete(null);
          }}
        />
      )}
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
