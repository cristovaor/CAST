import { useNavigate } from 'react-router-dom';
import {
  MoreHorizontal, ArrowUpRight, Users, Video, FlaskConical,
  Calendar,
} from 'lucide-react';
import { cn, scoreToQuality } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/formatters';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { QualityBadge } from '@/components/ui/QualityBadge';
import type { Project } from '@/types/domain';
import { useState } from 'react';

interface ProjectCardProps {
  project: Project;
  onEdit?: (id: string) => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function ProjectCard({ project, onEdit, onArchive, onDelete }: ProjectCardProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const qualityPct = (project.average_quality ?? 0) * 100;
  const qualityLevel = project.average_quality ? scoreToQuality(project.average_quality) : undefined;

  const hasData = (project.video_count ?? 0) > 0;

  return (
    <div
      className="card card-hover flex flex-col h-full animate-fade-in cursor-pointer group"
      onClick={() => navigate(`/app/projects/${project.id}`)}
      role="article"
      aria-label={`Projeto: ${project.name}`}
    >
      {/* Header */}
      <div className="p-5 border-b border-border">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {project.status && <StatusBadge status={project.status} size="sm" />}
              {hasData && qualityLevel && (
                <QualityBadge level={qualityLevel} score={project.average_quality} size="sm" />
              )}
            </div>
            <h3 className="font-semibold text-text-primary leading-snug text-[15px] group-hover:text-blue-600 transition-colors line-clamp-1">
              {project.name}
            </h3>
          </div>

          {/* Actions menu */}
          <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              aria-label="Ações do projeto"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1.5 rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-muted transition-colors"
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 w-44 py-1 bg-surface rounded-xl border border-border shadow-dropdown animate-scale-in">
                  <button
                    onClick={() => { navigate(`/app/projects/${project.id}`); setMenuOpen(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-app-bg transition-colors"
                  >
                    <ArrowUpRight size={13} />
                    Abrir projeto
                  </button>
                  {onEdit && (
                    <button
                      onClick={() => { onEdit(project.id); setMenuOpen(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-app-bg transition-colors"
                    >
                      Editar
                    </button>
                  )}
                  {onArchive && (
                    <button
                      onClick={() => { onArchive(project.id); setMenuOpen(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-app-bg transition-colors"
                    >
                      Arquivar
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => { onDelete(project.id); setMenuOpen(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Description */}
        {project.description && (
          <p className="text-[12px] text-text-muted line-clamp-2 leading-relaxed">
            {project.description}
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="px-5 py-3.5 grid grid-cols-3 gap-3 border-b border-border">
        <Stat icon={FlaskConical} label="Estudos"  value={project.study_count   ?? 0} />
        <Stat icon={Users}        label="Sessões"  value={project.session_count ?? 0} />
        <Stat icon={Video}        label="Vídeos"   value={project.video_count   ?? 0} />
      </div>

      {/* Quality bar */}
      {hasData && (
        <div className="px-5 py-3 border-b border-border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Qualidade média
            </span>
            <span className={cn(
              'text-[11px] font-semibold',
              qualityPct >= 90 ? 'text-emerald-600' : qualityPct >= 75 ? 'text-amber-600' : 'text-red-600',
            )}>
              {qualityPct.toFixed(0)}%
            </span>
          </div>
          <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                qualityPct >= 90 ? 'bg-emerald-500' : qualityPct >= 75 ? 'bg-amber-500' : 'bg-red-500',
              )}
              style={{ width: `${qualityPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-5 py-3 flex items-center justify-between mt-auto">
        {/* Responsible avatars */}
        <div className="flex -space-x-1.5">
          {(project.responsible ?? []).slice(0, 3).map((user) => (
            <div
              key={user.id}
              className="w-6 h-6 rounded-full ring-2 ring-white bg-blue-100 flex items-center justify-center"
              title={user.name}
            >
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.name} className="w-full h-full rounded-full object-cover" />
              ) : (
                <span className="text-[8px] font-bold text-blue-700">
                  {user.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </span>
              )}
            </div>
          ))}
          {(project.responsible?.length ?? 0) > 3 && (
            <div className="w-6 h-6 rounded-full ring-2 ring-white bg-surface-muted flex items-center justify-center">
              <span className="text-[8px] font-semibold text-text-muted">
                +{(project.responsible?.length ?? 0) - 3}
              </span>
            </div>
          )}
        </div>

        {/* Last activity */}
        {project.last_activity && (
          <div className="flex items-center gap-1 text-[10px] text-text-muted">
            <Calendar size={10} />
            {formatRelativeTime(project.last_activity)}
          </div>
        )}
      </div>

      {/* No-data overlay */}
      {!hasData && project.status === 'draft' && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-surface-muted rounded-b-xl" />
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-[13px] font-bold text-text-primary">{value}</div>
      <div className="flex items-center gap-1 text-[10px] text-text-muted font-medium">
        <Icon size={9} />
        {label}
      </div>
    </div>
  );
}
