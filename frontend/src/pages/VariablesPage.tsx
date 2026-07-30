import { useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { ToneBadge } from '@/components/ui/ToneBadge';
import type { VariableRole, VariableOrigin, ResearchVariable } from '@/types/research';
import { useVariables } from '@/features/multimodal/useMultimodal';
import { CreateVariableDialog } from '@/features/variables/CreateVariableDialog';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';

// Scientific variable registry (docs §14). Distinguishes roles (independent,
// dependent, covariate, confounder, moderator, mediator, outcomes, exploratory)
// and origins (raw/feature per modality, event, annotation, model output…).

const ROLE_LABEL: Record<VariableRole, string> = {
  independent: 'Independente', dependent: 'Dependente', covariate: 'Covariável',
  confounder: 'Confundidor', moderator: 'Moderador', mediator: 'Mediador',
  primary_outcome: 'Desfecho primário', secondary_outcome: 'Desfecho secundário',
  exploratory: 'Exploratória',
};

const ORIGIN_LABEL: Record<VariableOrigin, string> = {
  raw_video: 'Vídeo bruto', raw_eeg: 'EEG bruto', video_feature: 'Feature de vídeo',
  eeg_feature: 'Feature de EEG', event: 'Evento', annotation: 'Anotação',
  questionnaire: 'Questionário', test: 'Teste', experimental: 'Variável experimental',
  derived: 'Derivada', model_output: 'Saída de modelo', statistic: 'Cálculo estatístico',
};

const VALIDATION_TONE = { draft: 'neutral', in_review: 'warning', validated: 'success', deprecated: 'danger' } as const;
const VALIDATION_LABEL = { draft: 'Rascunho', in_review: 'Em revisão', validated: 'Validada', deprecated: 'Descontinuada' };

export function VariablesPage() {
  const { studyId } = useParams();
  const variablesQuery = useVariables(studyId);
  const { data: live } = variablesQuery;

  // Live variables mapped to the view model; mock fallback keeps the page useful.
  const variables: ResearchVariable[] = (live ?? []).map((v) => ({
        id: v.id, name: v.name, code: v.code,
        type: (v.var_type as ResearchVariable['type']) ?? 'numeric',
        unit: v.unit, origin: (v.origin as VariableOrigin) ?? 'derived',
        modality: v.modality as ResearchVariable['modality'],
        granularity: v.granularity, computationMethod: v.computation_method,
        role: (v.role as VariableRole) ?? 'exploratory',
        validationStatus: (v.validation_status as ResearchVariable['validationStatus']) ?? 'draft',
      }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Variáveis científicas</h2>
          <p className="text-sm text-text-muted">Cada variável registra tipo, unidade, origem, modalidade, método de cálculo, versão e papel no desenho.</p>
        </div>
        <CreateVariableDialog studyId={studyId}>
          <button className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus size={15} /> Nova variável
          </button>
        </CreateVariableDialog>
      </div>

      {variablesQuery.isError && (
        <ErrorState
          title="Não foi possível carregar as variáveis"
          message={
            variablesQuery.error instanceof Error
              ? variablesQuery.error.message
              : 'Tente novamente em instantes.'
          }
          onRetry={() => { void variablesQuery.refetch(); }}
          className="rounded-xl border border-border bg-surface"
        />
      )}

      {variablesQuery.isLoading && (
        <LoadingState
          message="Carregando variáveis..."
          className="rounded-xl border border-border bg-surface"
        />
      )}

      {!variablesQuery.isLoading && !variablesQuery.isError && variables.length === 0 && (
        <EmptyState
          title="Nenhuma variável definida"
          description="Cadastre as variáveis científicas do estudo para documentar tipo, unidade, origem e papel no desenho experimental."
          className="rounded-xl border border-border bg-surface"
        />
      )}

      {!variablesQuery.isLoading && !variablesQuery.isError && variables.length > 0 && (
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-text-muted border-b border-border bg-app-bg">
                <th scope="col" className="px-4 py-2.5 font-medium">Variável</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Código</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Papel</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Origem</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Unidade</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Granularidade</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {variables.map((v) => (
                <tr key={v.id} className="border-b border-border last:border-0 hover:bg-app-bg">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-text-primary">{v.name}</div>
                    {v.computationMethod && <div className="text-[11px] text-text-muted">{v.computationMethod}</div>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-text-secondary">{v.code}</td>
                  <td className="px-4 py-2.5 text-text-secondary">{ROLE_LABEL[v.role]}</td>
                  <td className="px-4 py-2.5 text-text-secondary">{ORIGIN_LABEL[v.origin]}</td>
                  <td className="px-4 py-2.5 text-text-muted">{v.unit ?? '—'}</td>
                  <td className="px-4 py-2.5 text-text-muted">{v.granularity ?? '—'}</td>
                  <td className="px-4 py-2.5"><ToneBadge tone={VALIDATION_TONE[v.validationStatus]}>{VALIDATION_LABEL[v.validationStatus]}</ToneBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
