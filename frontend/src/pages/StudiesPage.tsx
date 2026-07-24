import { useMemo, useState } from 'react';
import { Activity, CalendarClock, FlaskConical, Plus, Users, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ListFilterBar } from '@/components/data-display/ListFilterBar';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useProjects } from '@/features/projects/useProjects';
import { useStudies } from '@/features/studies/useStudies';
import type { Study } from '@/types/domain';
import { EXPERIMENTAL_DESIGNS, MODALITIES } from '@/types/research';

const DESIGN_LABEL = Object.fromEntries(EXPERIMENTAL_DESIGNS.map((design) => [design.value, design.label]));
const MODALITY_LABEL = Object.fromEntries(MODALITIES.map((modality) => [modality.value, modality.label]));

export function StudiesPage() {
  const { data: studies = [], isLoading } = useStudies();
  const { data: projects = [] } = useProjects();
  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState('');
  const [modality, setModality] = useState('');

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
    });
  }, [modality, projectId, search, status, studies]);

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

      <div className="space-y-4 p-6">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          </div>
        ) : studies.length === 0 ? (
          <EmptyState
            variant="empty"
            title="Nenhum estudo ainda"
            description="Crie um estudo configurável: defina a questão de pesquisa, o desenho experimental e as modalidades coletadas."
            icon={<FlaskConical size={40} className="text-slate-300" />}
          />
        ) : (
          <>
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
              ]}
            />

            {filteredStudies.length === 0 ? (
              <EmptyState
                variant="empty"
                title="Nenhum estudo corresponde aos filtros"
                description="Ajuste a busca ou limpe os filtros para ver outros estudos."
                icon={<FlaskConical size={40} className="text-slate-300" />}
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
      className="card flex flex-col p-5 transition-colors hover:border-blue-200"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="line-clamp-1 font-semibold text-slate-800">{study.name}</h3>
        <StatusBadge status={study.status || 'draft'} />
      </div>

      {config?.researchQuestion ? (
        <p className="line-clamp-2 min-h-[40px] text-sm text-slate-600">{config.researchQuestion}</p>
      ) : (
        <p className="line-clamp-2 min-h-[40px] text-sm text-slate-500">{study.description || 'Sem descrição'}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
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
        {modalities.filter((item) => item !== 'video' && item !== 'eeg').slice(0, 2).map((item) => (
          <span key={item} className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-500">
            {MODALITY_LABEL[item] ?? item}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-4 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1"><Users size={12} /> {study.participant_count ?? 0}</span>
        <span className="inline-flex items-center gap-1"><CalendarClock size={12} /> {study.session_count ?? 0} sessões</span>
      </div>
    </Link>
  );
}
