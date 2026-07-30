import { useParams, Link } from 'react-router-dom';
import { FlaskConical, Video, Activity, Target, ListChecks, Users, ShieldCheck } from 'lucide-react';
import { useStudy } from '@/features/studies/useStudies';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import { EXPERIMENTAL_DESIGNS, MODALITIES } from '@/types/research';

// Study overview — renders the configurable design persisted by the wizard
// (docs §7): research question, objectives, hypotheses, design, modalities.

const DESIGN_LABEL = Object.fromEntries(EXPERIMENTAL_DESIGNS.map((d) => [d.value, d.label]));
const MODALITY_LABEL = Object.fromEntries(MODALITIES.map((m) => [m.value, m.label]));

export function StudyOverviewPage() {
  const { studyId } = useParams();
  const { data: study, isLoading } = useStudy(studyId ?? '');

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <div className="w-8 h-8 rounded-full border-4 border-border border-t-blue-600 animate-spin" />
      </div>
    );
  }

  const cfg = study?.config ?? {};
  const hasConfig = !!(cfg.researchQuestion || cfg.design || (cfg.modalities?.length));

  return (
    <div className="space-y-6">
      {!hasConfig && (
        <div className="rounded-xl border border-dashed border-border-strong bg-app-bg p-6 text-center">
          <FlaskConical className="mx-auto mb-2 text-text-disabled" size={32} />
          <p className="text-sm font-medium text-text-secondary">Estudo sem configuração científica</p>
          <p className="text-[12px] text-text-muted mt-1">Este estudo foi criado sem o desenho detalhado. Recrie-o pelo assistente para definir questão, hipóteses e modalidades.</p>
          <Link to="/app/studies/new" className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            Abrir assistente de estudo
          </Link>
        </div>
      )}

      {hasConfig && (
        <>
          {/* Design + modalities strip */}
          <div className="flex flex-wrap items-center gap-2">
            {cfg.design && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-text-secondary">
                <FlaskConical size={13} className="text-text-muted" /> {DESIGN_LABEL[cfg.design] ?? cfg.design}
              </span>
            )}
            {(cfg.modalities ?? []).map((m) => (
              <span key={m} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-text-secondary">
                {m === 'video' && <Video size={13} className="text-blue-500" />}
                {m === 'eeg' && <Activity size={13} className="text-cyan-500" />}
                {MODALITY_LABEL[m] ?? m}
              </span>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {cfg.researchQuestion && (
              <Block icon={Target} title="Questão de pesquisa">
                <p className="text-sm text-text-secondary">{cfg.researchQuestion}</p>
              </Block>
            )}
            {cfg.generalObjective && (
              <Block icon={ListChecks} title="Objetivo geral">
                <p className="text-sm text-text-secondary">{cfg.generalObjective}</p>
              </Block>
            )}
            {cfg.specificObjectives && cfg.specificObjectives.length > 0 && (
              <Block icon={ListChecks} title="Objetivos específicos">
                <ul className="space-y-1">
                  {cfg.specificObjectives.map((o, i) => (
                    <li key={i} className="flex gap-2 text-sm text-text-secondary"><span className="text-text-disabled">•</span>{o}</li>
                  ))}
                </ul>
              </Block>
            )}
            {cfg.hypotheses && cfg.hypotheses.length > 0 && (
              <Block icon={FlaskConical} title="Hipóteses">
                <ul className="space-y-1.5">
                  {cfg.hypotheses.map((h, i) => (
                    <li key={i} className="text-sm text-text-secondary">
                      <span className="font-mono text-xs font-semibold text-blue-600 mr-1.5">{h.code}</span>
                      {h.statement}
                    </li>
                  ))}
                </ul>
              </Block>
            )}
            {cfg.groups && (
              <Block icon={Users} title="Grupos / condições">
                <p className="text-sm text-text-secondary whitespace-pre-line">{cfg.groups}</p>
              </Block>
            )}
            {cfg.variables && (
              <Block icon={ListChecks} title="Variáveis & desfechos">
                <p className="text-sm text-text-secondary whitespace-pre-line">{cfg.variables}</p>
              </Block>
            )}
            {(cfg.retentionPolicy || cfg.ethicsApprovalRef || cfg.purpose) && (
              <Block icon={ShieldCheck} title="Governança">
                {cfg.purpose && <p className="text-sm text-text-secondary mb-1">{cfg.purpose}</p>}
                {cfg.retentionPolicy && <p className="text-[12px] text-text-muted">Retenção: {cfg.retentionPolicy}</p>}
                {cfg.ethicsApprovalRef && <p className="text-[12px] text-text-muted">Aprovação ética: {cfg.ethicsApprovalRef}</p>}
              </Block>
            )}
          </div>

          <ScientificCaveat variant="association" compact />
        </>
      )}
    </div>
  );
}

function Block({ icon: Icon, title, children }: { icon: typeof Target; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className="text-text-muted" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
      </div>
      {children}
    </div>
  );
}
