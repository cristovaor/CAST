import { useNavigate } from 'react-router-dom';
import { ExternalLink, Users, Video } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { QualityBadge } from '@/components/ui/QualityBadge';
import { ActionButton } from '@/components/ui/ActionButton';
import { scoreToQuality } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/formatters';
import type { Study } from '@/types/domain';

interface RecentStudiesListProps {
  studies: Study[];
}

export function RecentStudiesList({ studies }: RecentStudiesListProps) {
  const navigate = useNavigate();

  return (
    <div className="card overflow-hidden flex flex-col h-full bg-surface shadow-sm ring-1 ring-border/50">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-muted/50">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary tracking-tight">Estudos recentes</h2>
          <p className="text-[13px] text-text-secondary mt-0.5">Projetos de pesquisa com atividade recente</p>
        </div>
        <ActionButton 
          variant="ghost" 
          size="sm" 
          onClick={() => navigate('/app/studies')}
          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 -mr-2"
        >
          Ver todos <ExternalLink size={14} className="ml-1" />
        </ActionButton>
      </div>
      <div className="divide-y divide-border flex-1 overflow-y-auto">
        {studies.length === 0 ? (
          <div className="p-8 text-center text-text-secondary text-sm">
            Nenhum estudo recente.
          </div>
        ) : (
          studies.map((study) => <RecentStudyRow key={study.id} study={study} />)
        )}
      </div>
    </div>
  );
}

function RecentStudyRow({ study }: { study: Study }) {
  const navigate = useNavigate();

  return (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 px-6 py-4 hover:bg-surface-hover transition-colors group">
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1.5">
          <StatusBadge status={study.status} size="sm" />
          <span 
                    className="text-[14px] font-semibold text-text-primary truncate cursor-pointer hover:text-blue-700 transition-colors"
            onClick={() => navigate(`/app/studies/${study.id}/overview`)}
          >
            {study.name}
          </span>
        </div>
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-text-muted font-medium">
          <div className="flex items-center gap-1.5 text-text-secondary">
            <Users size={12} className="text-text-muted" />
            {study.participant_count} participantes
          </div>
          <div className="flex items-center gap-1.5 text-text-secondary">
            <Video size={12} className="text-text-muted" />
            {study.video_count} vídeos
          </div>
          <span className="text-text-disabled">|</span>
          <span>Última sessão: {formatRelativeTime(study.created_at)}</span>
        </div>
      </div>

      {/* Right Content / Action */}
      <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0 mt-2 sm:mt-0">
        {study.average_quality !== undefined && study.average_quality > 0 && (
          <div className="flex flex-col items-start sm:items-end gap-1">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Qualidade</span>
            <QualityBadge
              level={scoreToQuality(study.average_quality)}
              score={study.average_quality}
              size="sm"
            />
          </div>
        )}
        <ActionButton 
          variant="secondary" 
          size="sm"
          className="opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => navigate(`/app/studies/${study.id}/overview`)}
        >
          Abrir
        </ActionButton>
      </div>
    </div>
  );
}
