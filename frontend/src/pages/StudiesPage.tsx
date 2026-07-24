import { Link } from 'react-router-dom';
import { FlaskConical, Plus, Video, Activity, Users, CalendarClock } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useStudies } from '@/features/studies/useStudies';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EXPERIMENTAL_DESIGNS, MODALITIES } from '@/types/research';
import type { Study } from '@/types/domain';

// Study list. The primary action opens the configurable multi-step wizard
// (docs §7) — not a name/description modal — so the platform stays reusable
// across research types (no educational bias).

const DESIGN_LABEL = Object.fromEntries(EXPERIMENTAL_DESIGNS.map((d) => [d.value, d.label]));
const MODALITY_LABEL = Object.fromEntries(MODALITIES.map((m) => [m.value, m.label]));

export function StudiesPage() {
  const { data: studies = [], isLoading } = useStudies();

  return (
    <div className="min-h-full">
      <PageHeader
        title="Estudos"
        description="Ambientes científicos configuráveis para análise multimodal sincronizada (vídeo + EEG). Cada estudo define seu próprio desenho, hipóteses e modalidades."
        actions={
          <Link
            to="/app/studies/new"
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={16} />
            Novo estudo
          </Link>
        }
      />
      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin" />
          </div>
        ) : studies.length === 0 ? (
          <EmptyState
            variant="empty"
            title="Nenhum estudo ainda"
            description="Crie um estudo configurável: defina a questão de pesquisa, o desenho experimental e as modalidades coletadas."
            icon={<FlaskConical size={40} className="text-slate-300" />}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {studies.map((study) => (
              <StudyCard key={study.id} study={study} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StudyCard({ study }: { study: Study }) {
  const cfg = study.config;
  const design = cfg?.design ? DESIGN_LABEL[cfg.design] : undefined;
  const modalities = cfg?.modalities ?? [];

  return (
    <Link
      to={`/app/studies/${study.id}/overview`}
      className="card p-5 hover:border-blue-200 transition-colors flex flex-col"
    >
      <div className="flex justify-between items-start mb-2 gap-2">
        <h3 className="font-semibold text-slate-800 line-clamp-1">{study.name}</h3>
        <StatusBadge status={study.status || 'draft'} />
      </div>

      {cfg?.researchQuestion ? (
        <p className="text-sm text-slate-600 line-clamp-2 min-h-[40px]">{cfg.researchQuestion}</p>
      ) : (
        <p className="text-sm text-slate-500 line-clamp-2 min-h-[40px]">{study.description || 'Sem descrição'}</p>
      )}

      {/* Design + modalities */}
      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        {design && (
          <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-600">
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
        {modalities.filter((m) => m !== 'video' && m !== 'eeg').slice(0, 2).map((m) => (
          <span key={m} className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-500">
            {MODALITY_LABEL[m] ?? m}
          </span>
        ))}
      </div>

      {/* Counts */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-4 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1"><Users size={12} /> {study.participant_count ?? 0}</span>
        <span className="inline-flex items-center gap-1"><CalendarClock size={12} /> {study.session_count ?? 0} sessões</span>
      </div>
    </Link>
  );
}
