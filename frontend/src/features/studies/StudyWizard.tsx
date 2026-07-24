import { useState } from 'react';
import { Stepper } from '@/components/ui/Stepper';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import {
  EXPERIMENTAL_DESIGNS, MODALITIES,
  type ExperimentalDesign, type Modality,
} from '@/types/research';
import { Check } from 'lucide-react';
import { useCreateStudy } from './useStudies';

// Configurable study creation (docs §7). The flow never forces an educational
// objective; pre/post-test are just one optional data source. The design is
// open (observational … replication … custom) and modalities are chosen freely,
// with video + EEG as the methodological core.

const STEPS = [
  { id: 'general', name: 'Informações gerais' },
  { id: 'question', name: 'Questão & hipóteses' },
  { id: 'design', name: 'Desenho' },
  { id: 'modalities', name: 'Modalidades' },
  { id: 'governance', name: 'Governança' },
  { id: 'review', name: 'Revisão' },
];

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
  const [step, setStep] = useState(0);
  const [design, setDesign] = useState<ExperimentalDesign>('experimental');
  const [modalities, setModalities] = useState<Modality[]>(['video', 'eeg', 'events']);
  const [form, setForm] = useState<WizardState>(EMPTY);
  const createStudy = useCreateStudy();

  const set = (key: keyof WizardState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const toggle = (m: Modality) =>
    setModalities((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const submit = () => {
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
        name: form.name || 'Novo estudo',
        description: form.description,
        project_id: projectId,
        config,
      } as never,
      { onSuccess: () => onDone?.() },
    );
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8"><Stepper steps={STEPS} currentStep={step} /></div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
        {step === 0 && (
          <Section title="Informações gerais">
            <Text label="Nome do estudo" placeholder="Ex: Fadiga em operadores — neuroergonomia" value={form.name} onChange={set('name')} />
            <Textarea label="Descrição" placeholder="Contexto, população e escopo (sem assumir um objetivo educacional)…" value={form.description} onChange={set('description')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Text label="Programa / linha de pesquisa" placeholder="Ex: Neuroergonomia 2026" value={form.program} onChange={set('program')} />
              <Text label="Responsável" placeholder="Pesquisador principal" value={form.responsible} onChange={set('responsible')} />
            </div>
          </Section>
        )}

        {step === 1 && (
          <Section title="Questão de pesquisa & hipóteses">
            <Text label="Questão de pesquisa" placeholder="O que se investiga?" value={form.researchQuestion} onChange={set('researchQuestion')} />
            <Textarea label="Objetivo geral" placeholder="Objetivo amplo do estudo…" value={form.generalObjective} onChange={set('generalObjective')} />
            <Textarea label="Objetivos específicos" placeholder="Um por linha…" value={form.specificObjectives} onChange={set('specificObjectives')} />
            <div className="rounded-lg border border-slate-200 p-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Hipóteses (opcionais)</label>
              <div className="mt-2 space-y-2">
                <Text label="H1" placeholder="Direcional, não-direcional, nula ou exploratória" value={form.hypothesis1} onChange={set('hypothesis1')} />
              </div>
            </div>
            <ScientificCaveat variant="association" compact />
          </Section>
        )}

        {step === 2 && (
          <Section title="Desenho experimental">
            <p className="text-[13px] text-slate-500 -mt-1">O desenho não se limita a pré-teste e pós-teste. Escolha o mais adequado à sua pergunta.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {EXPERIMENTAL_DESIGNS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDesign(d.value)}
                  className={`text-left rounded-lg border p-3 transition-colors ${design === d.value ? 'border-blue-400 bg-blue-50/60' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-800">{d.label}</span>
                    {design === d.value && <Check size={15} className="text-blue-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{d.hint}</p>
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 pt-2">
              <Textarea label="Grupos / condições" placeholder="Ex: baseline, carga alta…" value={form.groups} onChange={set('groups')} />
              <Textarea label="Variáveis & desfechos" placeholder="Independentes, dependentes, covariáveis…" value={form.variables} onChange={set('variables')} />
            </div>
          </Section>
        )}

        {step === 3 && (
          <Section title="Modalidades coletadas">
            <p className="text-[13px] text-slate-500 -mt-1">Vídeo e EEG são o núcleo metodológico. Testes e questionários são complementares e opcionais.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODALITIES.map((m) => {
                const on = modalities.includes(m.value);
                return (
                  <button
                    key={m.value}
                    onClick={() => toggle(m.value)}
                    className={`text-left rounded-lg border p-3 transition-colors ${on ? 'border-blue-400 bg-blue-50/60' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-800">
                        {m.label}
                        {m.core && <span className="ml-2 text-[9px] uppercase tracking-wide text-blue-600 bg-blue-50 border border-blue-200 rounded px-1 py-0.5">núcleo</span>}
                      </span>
                      <span className={`w-4 h-4 rounded border flex items-center justify-center ${on ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                        {on && <Check size={11} className="text-white" />}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{m.description}</p>
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {step === 4 && (
          <Section title="Governança & consentimento">
            <div className="grid gap-4 sm:grid-cols-2">
              <Text label="Política de retenção" placeholder="Ex: descarte de vídeo bruto após 24 meses" value={form.retentionPolicy} onChange={set('retentionPolicy')} />
              <Text label="Referência de aprovação ética" placeholder="Ex: CAAE / IRB nº" value={form.ethicsApprovalRef} onChange={set('ethicsApprovalRef')} />
            </div>
            <Textarea label="Finalidade do uso dos dados" placeholder="Descreva a finalidade consentida…" value={form.purpose} onChange={set('purpose')} />
            <ScientificCaveat variant="privacy" />
          </Section>
        )}

        {step === 5 && (
          <Section title="Revisão & ativação">
            <div className="rounded-lg border border-slate-200 p-4 space-y-2 text-[13px]">
              <Line k="Nome" v={form.name || '—'} />
              <Line k="Questão" v={form.researchQuestion || '—'} />
              <Line k="Desenho" v={EXPERIMENTAL_DESIGNS.find((d) => d.value === design)?.label} />
              <Line k="Modalidades" v={modalities.map((m) => MODALITIES.find((x) => x.value === m)?.label).join(', ')} />
              <Line k="Núcleo" v="Vídeo + EEG sincronizados" />
            </div>
            <ScientificCaveat variant="association" compact>
              O estudo será ativado sem inferir automaticamente estados cognitivos. Análises distinguem dados observados, features e estimativas de modelo.
            </ScientificCaveat>
          </Section>
        )}

        <div className="mt-8 flex justify-between border-t border-slate-100 pt-5">
          <button
            onClick={back}
            disabled={step === 0}
            className="px-4 py-2 rounded-md border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            Voltar
          </button>
          {step < STEPS.length - 1 ? (
            <button onClick={next} className="px-5 py-2 rounded-md bg-blue-600 text-sm font-medium text-white hover:bg-blue-700">Próximo</button>
          ) : (
            <button
              onClick={submit}
              disabled={createStudy.isPending}
              className="px-5 py-2 rounded-md bg-emerald-600 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {createStudy.isPending ? 'Ativando…' : 'Ativar estudo'}
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
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      {children}
    </div>
  );
}
function Text({ label, placeholder, value, onChange }: { label: string; placeholder?: string; value?: string; onChange?: React.ChangeEventHandler<HTMLInputElement> }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <input value={value} onChange={onChange} placeholder={placeholder} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
    </div>
  );
}
function Textarea({ label, placeholder, value, onChange }: { label: string; placeholder?: string; value?: string; onChange?: React.ChangeEventHandler<HTMLTextAreaElement> }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <textarea rows={2} value={value} onChange={onChange} placeholder={placeholder} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
    </div>
  );
}
function Line({ k, v }: { k: string; v?: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2">
      <span className="text-slate-400">{k}</span>
      <span className="text-slate-700 font-medium">{v ?? '—'}</span>
    </div>
  );
}
