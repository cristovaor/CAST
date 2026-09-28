import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Stepper } from '@/components/ui/Stepper';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import {
  EXPERIMENTAL_DESIGNS, MODALITIES,
  type ExperimentalDesign, type Modality,
} from '@/types/research';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProjects } from '@/features/projects/useProjects';
import { useCreateStudy } from './useStudies';

// Configurable study creation (docs §7). The flow never forces an educational
// objective; pre/post-test are just one optional data source. The design is
// open (observational … replication … custom) and modalities are chosen freely,
// with video + EEG as the methodological core.

const STEP_IDS = ['general', 'question', 'design', 'modalities', 'governance', 'review'] as const;

// Collected fields persisted into Study.config (docs §3, §7). Kept flat and
// simple; the backend stores the whole object as JSONB so the platform stays
// reusable across research types.
interface WizardState {
  name: string;
  description: string;
  program: string;
  responsible: string;
  researchQuestion: string;
  generalObjective: string;
  specificObjectives: string;
  hypothesis1: string;
  groups: string;
  variables: string;
  retentionPolicy: string;
  ethicsApprovalRef: string;
  purpose: string;
}

const EMPTY: WizardState = {
  name: '', description: '', program: '', responsible: '', researchQuestion: '',
  generalObjective: '', specificObjectives: '', hypothesis1: '', groups: '',
  variables: '', retentionPolicy: '', ethicsApprovalRef: '', purpose: '',
};

export function StudyWizard({ onDone, projectId }: { onDone?: () => void; projectId?: string }) {
  const { t } = useTranslation('studies');
  const STEPS = STEP_IDS.map((id) => ({ id, name: t(`wizard.steps.${id}`) }));
  const [step, setStep] = useState(0);
  const [design, setDesign] = useState<ExperimentalDesign>('experimental');
  const [modalities, setModalities] = useState<Modality[]>(['video', 'eeg', 'events']);
  const [form, setForm] = useState<WizardState>(EMPTY);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const projectsQuery = useProjects();
  const createStudy = useCreateStudy();
  const projects = projectsQuery.data ?? [];
  const selectedProject = projects.find((project) => project.id === selectedProjectId);

  const set = (key: keyof WizardState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const toggle = (m: Modality) =>
    setModalities((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  const next = () => {
    if (step === 0 && !selectedProject) {
      setValidationError(
        selectedProjectId
          ? t('wizard.projectUnavailable')
          : t('wizard.selectProject'),
      );
      return;
    }
    setValidationError(null);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const submit = () => {
    if (!selectedProject) {
      setValidationError(
        selectedProjectId
          ? t('wizard.projectUnavailable')
          : t('wizard.selectProjectBeforeActivate'),
      );
      setStep(0);
      return;
    }
    setValidationError(null);
    const config = {
      researchQuestion: form.researchQuestion,
      generalObjective: form.generalObjective,
      specificObjectives: form.specificObjectives.split('\n').map((s) => s.trim()).filter(Boolean),
      hypotheses: form.hypothesis1 ? [{ code: 'H1', statement: form.hypothesis1 }] : [],
      design,
      modalities,
      groups: form.groups,
      variables: form.variables,
      retentionPolicy: form.retentionPolicy,
      ethicsApprovalRef: form.ethicsApprovalRef,
      purpose: form.purpose,
      program: form.program,
      responsible: form.responsible,
    };
    createStudy.mutate(
      {
        name: form.name || t('wizard.defaultName'),
        description: form.description,
        project_id: selectedProjectId,
        config,
      },
      { onSuccess: () => onDone?.() },
    );
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8"><Stepper steps={STEPS} currentStep={step} /></div>

      <div className="rounded-xl border border-border bg-surface p-6 md:p-8 shadow-sm">
        {step === 0 && (
          <Section title={t('wizard.general.title')}>
            <div className="space-y-1.5">
              <label htmlFor="study-project" className="text-sm font-medium text-text-secondary">
                {t('wizard.general.project')} <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <select
                id="study-project"
                required
                value={selectedProjectId}
                disabled={Boolean(projectId) || projectsQuery.isLoading}
                onChange={(event) => {
                  setSelectedProjectId(event.target.value);
                  setValidationError(null);
                  createStudy.reset();
                }}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-app-bg disabled:text-text-secondary"
              >
                <option value="">
                  {projectsQuery.isLoading ? t('wizard.general.loadingProjects') : t('wizard.general.selectProjectOption')}
                </option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              {projectId && selectedProject && (
                <p className="text-xs text-text-muted">{t('wizard.general.projectFromOrigin')}</p>
              )}
              {projectsQuery.isError && (
                <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                  {t('wizard.general.projectsFailed')}
                </p>
              )}
              {!projectsQuery.isLoading && !projectsQuery.isError && projects.length === 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {t('wizard.general.noProjects')}{' '}
                  <Link to="/app/projects" className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
                    {t('wizard.general.createProjectFirst')}
                  </Link>.
                </p>
              )}
              {!projectsQuery.isLoading && selectedProjectId && !selectedProject && (
                <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                  {t('wizard.projectUnavailable')}
                </p>
              )}
            </div>
            <Text label={t('wizard.general.name')} placeholder={t('wizard.general.namePlaceholder')} value={form.name} onChange={set('name')} />
            <Textarea label={t('wizard.general.description')} placeholder={t('wizard.general.descriptionPlaceholder')} value={form.description} onChange={set('description')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Text label={t('wizard.general.program')} placeholder={t('wizard.general.programPlaceholder')} value={form.program} onChange={set('program')} />
              <Text label={t('wizard.general.responsible')} placeholder={t('wizard.general.responsiblePlaceholder')} value={form.responsible} onChange={set('responsible')} />
            </div>
          </Section>
        )}

        {step === 1 && (
          <Section title={t('wizard.question.title')}>
            <Text label={t('wizard.question.researchQuestion')} placeholder={t('wizard.question.researchQuestionPlaceholder')} value={form.researchQuestion} onChange={set('researchQuestion')} />
            <Textarea label={t('wizard.question.generalObjective')} placeholder={t('wizard.question.generalObjectivePlaceholder')} value={form.generalObjective} onChange={set('generalObjective')} />
            <Textarea label={t('wizard.question.specificObjectives')} placeholder={t('wizard.question.specificObjectivesPlaceholder')} value={form.specificObjectives} onChange={set('specificObjectives')} />
            <fieldset className="rounded-lg border border-border p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{t('wizard.question.hypotheses')}</legend>
              <div className="space-y-2">
                <Text label="H1" placeholder={t('wizard.question.h1Placeholder')} value={form.hypothesis1} onChange={set('hypothesis1')} />
              </div>
            </fieldset>
            <ScientificCaveat variant="association" compact />
          </Section>
        )}

        {step === 2 && (
          <Section title={t('wizard.design.title')}>
            <p className="text-[13px] text-text-muted -mt-1">{t('wizard.design.hint')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {EXPERIMENTAL_DESIGNS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={design === d.value}
                  onClick={() => setDesign(d.value)}
                  className={`text-left rounded-lg border p-3 transition-colors ${design === d.value ? 'border-blue-400 bg-blue-50/60 dark:border-blue-700 dark:bg-blue-950/40' : 'border-border hover:border-border-strong'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text-primary">{d.label}</span>
                    {design === d.value && <Check size={15} className="text-blue-600" aria-hidden="true" />}
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">{d.hint}</p>
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 pt-2">
              <Textarea label={t('wizard.design.groups')} placeholder={t('wizard.design.groupsPlaceholder')} value={form.groups} onChange={set('groups')} />
              <Textarea label={t('wizard.design.variables')} placeholder={t('wizard.design.variablesPlaceholder')} value={form.variables} onChange={set('variables')} />
            </div>
          </Section>
        )}

        {step === 3 && (
          <Section title={t('wizard.modalities.title')}>
            <p className="text-[13px] text-text-muted -mt-1">{t('wizard.modalities.hint')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODALITIES.map((m) => {
                const on = modalities.includes(m.value);
                return (
                  <button
                    key={m.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(m.value)}
                    className={`text-left rounded-lg border p-3 transition-colors ${on ? 'border-blue-400 bg-blue-50/60 dark:border-blue-700 dark:bg-blue-950/40' : 'border-border hover:border-border-strong'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-text-primary">
                        {m.label}
                        {m.core && <span className="ml-2 text-[9px] uppercase tracking-wide text-blue-600 bg-blue-50 border border-blue-200 rounded px-1 py-0.5 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-300">{t('wizard.modalities.core')}</span>}
                      </span>
                      <span className={`w-4 h-4 rounded border flex items-center justify-center ${on ? 'bg-blue-600 border-blue-600' : 'border-border-strong'}`}>
                        {on && <Check size={11} className="text-white" aria-hidden="true" />}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-muted mt-0.5">{m.description}</p>
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {step === 4 && (
          <Section title={t('wizard.governance.title')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Text label={t('wizard.governance.retention')} placeholder={t('wizard.governance.retentionPlaceholder')} value={form.retentionPolicy} onChange={set('retentionPolicy')} />
              <Text label={t('wizard.governance.ethics')} placeholder={t('wizard.governance.ethicsPlaceholder')} value={form.ethicsApprovalRef} onChange={set('ethicsApprovalRef')} />
            </div>
            <Textarea label={t('wizard.governance.purpose')} placeholder={t('wizard.governance.purposePlaceholder')} value={form.purpose} onChange={set('purpose')} />
            <ScientificCaveat variant="privacy" />
          </Section>
        )}

        {step === 5 && (
          <Section title={t('wizard.review.title')}>
            <div className="rounded-lg border border-border p-4 space-y-2 text-[13px]">
              <Line k={t('wizard.review.name')} v={form.name || '—'} />
              <Line k={t('wizard.review.project')} v={selectedProject?.name || t('wizard.review.projectUnavailable')} />
              <Line k={t('wizard.review.question')} v={form.researchQuestion || '—'} />
              <Line k={t('wizard.review.design')} v={EXPERIMENTAL_DESIGNS.find((d) => d.value === design)?.label} />
              <Line k={t('wizard.review.modalities')} v={modalities.map((m) => MODALITIES.find((x) => x.value === m)?.label).join(', ')} />
              <Line k={t('wizard.review.core')} v={t('wizard.review.coreValue')} />
            </div>
            <ScientificCaveat variant="association" compact>
              {t('wizard.review.caveat')}
            </ScientificCaveat>
          </Section>
        )}

        {(validationError || createStudy.isError) && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" role="alert">
            {validationError ?? t('wizard.createFailed', { message: (createStudy.error as Error).message })}
          </div>
        )}

        <div className="mt-8 flex justify-between border-t border-border pt-5">
          <button
            type="button"
            onClick={back}
            disabled={step === 0}
            className="px-4 py-2 rounded-md border border-border text-sm font-medium text-text-secondary hover:bg-app-bg disabled:opacity-40"
          >
            {t('wizard.back')}
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={next}
              disabled={step === 0 && (projectsQuery.isLoading || projects.length === 0)}
              className="px-5 py-2 rounded-md bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('wizard.next')}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={createStudy.isPending || !selectedProject}
              className="px-5 py-2 rounded-md bg-emerald-600 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {createStudy.isPending ? t('wizard.activating') : t('wizard.activate')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
      {children}
    </div>
  );
}
function Text({ label, placeholder, value, onChange }: { label: string; placeholder?: string; value?: string; onChange?: React.ChangeEventHandler<HTMLInputElement> }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-secondary">{label}</label>
      <input id={id} value={value} onChange={onChange} placeholder={placeholder} className="w-full rounded-md border border-border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
    </div>
  );
}
function Textarea({ label, placeholder, value, onChange }: { label: string; placeholder?: string; value?: string; onChange?: React.ChangeEventHandler<HTMLTextAreaElement> }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-secondary">{label}</label>
      <textarea id={id} rows={2} value={value} onChange={onChange} placeholder={placeholder} className="w-full rounded-md border border-border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
    </div>
  );
}
function Line({ k, v }: { k: string; v?: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2">
      <span className="text-text-muted">{k}</span>
      <span className="text-text-secondary font-medium">{v ?? '—'}</span>
    </div>
  );
}
