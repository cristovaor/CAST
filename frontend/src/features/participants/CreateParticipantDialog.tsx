import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  BookOpenCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Dices,
  FlaskConical,
  GraduationCap,
  ShieldCheck,
  UserRoundSearch,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import { cn } from '@/lib/utils';
import { useStudies } from '@/features/studies/useStudies';
import type { ConsentStatus, ParticipantCreate } from '@/types/domain';
import { useCreateParticipant } from './useParticipants';

const STEPS = [
  { label: 'Vínculo', description: 'Estudo e código', icon: FlaskConical },
  { label: 'Perfil', description: 'Variáveis descritivas', icon: UserRoundSearch },
  { label: 'Ética', description: 'Elegibilidade e TCLE', icon: ShieldCheck },
  { label: 'Revisão', description: 'Conferência final', icon: BookOpenCheck },
] as const;

const INITIAL_FORM = {
  study_id: '',
  external_code: '',
  cohort: '',
  age_range: '',
  gender: '',
  education_level: '',
  handedness: '',
  recruitment_source: '',
  consent_status: 'pending' as Extract<ConsentStatus, 'pending' | 'accepted'>,
  consent_version: '1.0',
  eligibility_confirmed: false,
  identifiers_excluded: false,
};

type FormState = typeof INITIAL_FORM;

function compactRecord(record: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value.trim() !== ''),
  );
}

function buildParticipantPayload(form: FormState): ParticipantCreate {
  const academicProfile = compactRecord({
    cohort: form.cohort,
    age_range: form.age_range,
    gender: form.gender,
    education_level: form.education_level,
    handedness: form.handedness,
    recruitment_source: form.recruitment_source,
  });

  return {
    study_id: form.study_id,
    external_code: form.external_code.trim().toUpperCase(),
    consent_status: form.consent_status,
    consent_version: form.consent_status === 'accepted'
      ? form.consent_version.trim()
      : undefined,
    demographic_group: {
      ...academicProfile,
      enrollment: {
        eligibility_confirmed: form.eligibility_confirmed,
        direct_identifiers_excluded: form.identifiers_excluded,
      },
    },
  };
}

function generateParticipantCode() {
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase();
  return `P-${suffix}`;
}

export function CreateParticipantDialog({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const { data: studies, isLoading: isLoadingStudies } = useStudies();
  const createParticipant = useCreateParticipant();

  const selectedStudy = useMemo(
    () => studies?.find((study) => study.id === form.study_id),
    [form.study_id, studies],
  );

  const setField = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (createParticipant.isError) createParticipant.reset();
  };

  const reset = () => {
    setStep(0);
    setForm(INITIAL_FORM);
    createParticipant.reset();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  };

  const canContinue = step === 0
    ? Boolean(form.study_id && form.external_code.trim().length >= 2)
    : step === 2
      ? Boolean(
          form.eligibility_confirmed
          && form.identifiers_excluded
          && (form.consent_status === 'pending' || form.consent_version.trim()),
        )
      : true;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (step < STEPS.length - 1) {
      if (canContinue) setStep((current) => current + 1);
      return;
    }

    createParticipant.mutate(buildParticipantPayload(form), {
      onSuccess: () => {
        setOpen(false);
        reset();
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border bg-surface-muted/60 px-5 py-5 pr-12 sm:px-7">
          <div className="flex items-start gap-3 text-left">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <GraduationCap size={20} aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-xl">Registro de participante</DialogTitle>
              <DialogDescription className="mt-1 max-w-xl">
                Inclusão pseudonimizada no protocolo de pesquisa, com rastreabilidade ética e
                coleta mínima de dados.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="border-b border-border px-5 py-4 sm:px-7">
          <ol className="grid grid-cols-4 gap-2" aria-label="Etapas do cadastro">
            {STEPS.map((item, index) => {
              const Icon = item.icon;
              const isComplete = index < step;
              const isCurrent = index === step;
              return (
                <li
                  key={item.label}
                  aria-current={isCurrent ? 'step' : undefined}
                  className="min-w-0"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition',
                        isComplete && 'border-emerald-600 bg-emerald-600 text-white',
                        isCurrent && 'border-blue-600 bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-950',
                        !isComplete && !isCurrent && 'border-border-strong bg-surface text-text-muted',
                      )}
                    >
                      {isComplete ? <Check size={15} aria-hidden="true" /> : <Icon size={14} aria-hidden="true" />}
                    </span>
                    <span className="hidden min-w-0 sm:block">
                      <span className={cn('block truncate text-xs font-semibold', isCurrent ? 'text-blue-700 dark:text-blue-300' : 'text-text-primary')}>
                        {item.label}
                      </span>
                      <span className="block truncate text-[11px] text-text-muted">{item.description}</span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-xs font-medium text-text-secondary sm:hidden">
            Etapa {step + 1} de {STEPS.length}: {STEPS[step].label} — {STEPS[step].description}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
            {step === 0 && (
              <section aria-labelledby="participant-step-link" className="space-y-5">
                <SectionHeading
                  id="participant-step-link"
                  eyebrow="Contexto da pesquisa"
                  title="Vincule o registro ao estudo"
                  description="O participante será associado ao protocolo e identificado apenas por um código de pesquisa."
                />

                <Field label="Estudo de destino" htmlFor="participant-study" required>
                  <select
                    id="participant-study"
                    required
                    autoFocus
                    value={form.study_id}
                    onChange={(event) => setField('study_id', event.target.value)}
                    disabled={isLoadingStudies}
                    className={fieldClassName}
                  >
                    <option value="">Selecione um estudo…</option>
                    {studies?.map((study) => (
                      <option key={study.id} value={study.id}>
                        {study.name} · {study.status === 'active' ? 'Ativo' : study.status === 'draft' ? 'Rascunho' : study.status}
                      </option>
                    ))}
                  </select>
                </Field>

                {selectedStudy && (
                  <div className="grid gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-sm dark:border-blue-900 dark:bg-blue-950/30 sm:grid-cols-3">
                    <StudyFact label="Estudo" value={selectedStudy.name} />
                    <StudyFact label="Protocolo" value={selectedStudy.protocol_version || 'Não informado'} />
                    <StudyFact
                      label="Aprovação ética"
                      value={selectedStudy.config?.ethicsApprovalRef || 'Não informada'}
                      warning={!selectedStudy.config?.ethicsApprovalRef}
                    />
                  </div>
                )}

                <Field
                  label="Código pseudonimizado"
                  htmlFor="participant-code"
                  required
                  hint="Use somente o identificador definido no protocolo. Não informe nome, CPF, e-mail ou prontuário."
                >
                  <div className="flex gap-2">
                    <input
                      id="participant-code"
                      required
                      minLength={2}
                      maxLength={80}
                      value={form.external_code}
                      onChange={(event) => setField('external_code', event.target.value.toUpperCase())}
                      placeholder="Ex.: P-0042"
                      className={cn(fieldClassName, 'font-mono uppercase tracking-wide')}
                    />
                    <button
                      type="button"
                      onClick={() => setField('external_code', generateParticipantCode())}
                      className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-muted hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <Dices size={16} aria-hidden="true" />
                      <span className="hidden sm:inline">Gerar código</span>
                      <span className="sm:hidden">Gerar</span>
                    </button>
                  </div>
                </Field>
              </section>
            )}

            {step === 1 && (
              <section aria-labelledby="participant-step-profile" className="space-y-5">
                <SectionHeading
                  id="participant-step-profile"
                  eyebrow="Caracterização da amostra"
                  title="Perfil acadêmico do participante"
                  description="Registre apenas variáveis previstas no protocolo. Todos os campos desta etapa são opcionais."
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Grupo, braço ou coorte" htmlFor="participant-cohort">
                    <input
                      id="participant-cohort"
                      autoFocus
                      value={form.cohort}
                      onChange={(event) => setField('cohort', event.target.value)}
                      placeholder="Ex.: Controle, intervenção A"
                      className={fieldClassName}
                    />
                  </Field>
                  <Field label="Faixa etária" htmlFor="participant-age-range">
                    <select
                      id="participant-age-range"
                      value={form.age_range}
                      onChange={(event) => setField('age_range', event.target.value)}
                      className={fieldClassName}
                    >
                      <option value="">Não informar</option>
                      <option value="18-24">18–24 anos</option>
                      <option value="25-34">25–34 anos</option>
                      <option value="35-44">35–44 anos</option>
                      <option value="45-54">45–54 anos</option>
                      <option value="55-64">55–64 anos</option>
                      <option value="65+">65 anos ou mais</option>
                    </select>
                  </Field>
                  <Field label="Gênero autodeclarado" htmlFor="participant-gender">
                    <select
                      id="participant-gender"
                      value={form.gender}
                      onChange={(event) => setField('gender', event.target.value)}
                      className={fieldClassName}
                    >
                      <option value="">Não informar</option>
                      <option value="woman">Mulher</option>
                      <option value="man">Homem</option>
                      <option value="non_binary">Não binário</option>
                      <option value="self_described">Outra autodescrição</option>
                      <option value="not_disclosed">Prefere não declarar</option>
                    </select>
                  </Field>
                  <Field label="Escolaridade" htmlFor="participant-education">
                    <select
                      id="participant-education"
                      value={form.education_level}
                      onChange={(event) => setField('education_level', event.target.value)}
                      className={fieldClassName}
                    >
                      <option value="">Não informar</option>
                      <option value="elementary">Ensino fundamental</option>
                      <option value="high_school">Ensino médio</option>
                      <option value="undergraduate">Graduação</option>
                      <option value="postgraduate">Pós-graduação</option>
                    </select>
                  </Field>
                  <Field label="Lateralidade" htmlFor="participant-handedness">
                    <select
                      id="participant-handedness"
                      value={form.handedness}
                      onChange={(event) => setField('handedness', event.target.value)}
                      className={fieldClassName}
                    >
                      <option value="">Não informar</option>
                      <option value="right">Destro</option>
                      <option value="left">Canhoto</option>
                      <option value="ambidextrous">Ambidestro</option>
                    </select>
                  </Field>
                  <Field label="Origem do recrutamento" htmlFor="participant-recruitment">
                    <input
                      id="participant-recruitment"
                      value={form.recruitment_source}
                      onChange={(event) => setField('recruitment_source', event.target.value)}
                      placeholder="Ex.: Edital público, ambulatório"
                      className={fieldClassName}
                    />
                  </Field>
                </div>

                <p className="rounded-lg border border-border bg-surface-muted px-4 py-3 text-xs leading-relaxed text-text-secondary">
                  Princípio de minimização: não colete uma variável apenas por conveniência. Ela deve
                  estar vinculada à hipótese, aos critérios amostrais ou ao plano de análise.
                </p>
              </section>
            )}

            {step === 2 && (
              <section aria-labelledby="participant-step-ethics" className="space-y-5">
                <SectionHeading
                  id="participant-step-ethics"
                  eyebrow="Governança e ética"
                  title="Documente a situação do consentimento"
                  description="O registro de aceite deve corresponder ao TCLE aprovado e efetivamente apresentado ao participante."
                />

                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold text-text-primary">
                    Situação do consentimento <span className="text-red-600">*</span>
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ConsentOption
                      checked={form.consent_status === 'pending'}
                      title="Pendente"
                      description="Cadastrar para triagem, sem liberar uso dos dados."
                      onChange={() => setField('consent_status', 'pending')}
                    />
                    <ConsentOption
                      checked={form.consent_status === 'accepted'}
                      title="Aceito"
                      description="TCLE já obtido e pronto para registro auditável."
                      onChange={() => setField('consent_status', 'accepted')}
                    />
                  </div>
                </fieldset>

                {form.consent_status === 'accepted' && (
                  <Field
                    label="Versão do TCLE"
                    htmlFor="participant-consent-version"
                    required
                    hint="Informe exatamente a versão aprovada e apresentada ao participante."
                  >
                    <input
                      id="participant-consent-version"
                      required
                      autoFocus
                      value={form.consent_version}
                      onChange={(event) => setField('consent_version', event.target.value)}
                      placeholder="Ex.: 2.1 — 15/03/2026"
                      className={fieldClassName}
                    />
                  </Field>
                )}

                <div className="space-y-3 rounded-xl border border-border bg-surface-muted/60 p-4">
                  <Attestation
                    checked={form.eligibility_confirmed}
                    onChange={(checked) => setField('eligibility_confirmed', checked)}
                    title="Critérios de elegibilidade conferidos"
                    description="Os critérios de inclusão e exclusão definidos no protocolo foram verificados."
                  />
                  <Attestation
                    checked={form.identifiers_excluded}
                    onChange={(checked) => setField('identifiers_excluded', checked)}
                    title="Ausência de identificadores diretos"
                    description="O código e os metadados não contêm nome, contato, documento ou prontuário."
                  />
                </div>
              </section>
            )}

            {step === 3 && (
              <section aria-labelledby="participant-step-review" className="space-y-5">
                <SectionHeading
                  id="participant-step-review"
                  eyebrow="Revisão do registro"
                  title="Confira antes de incluir na amostra"
                  description="A criação será registrada na trilha de auditoria da organização."
                />

                <dl className="overflow-hidden rounded-xl border border-border">
                  <ReviewRow label="Estudo" value={selectedStudy?.name || '—'} />
                  <ReviewRow
                    label="Aprovação ética"
                    value={selectedStudy?.config?.ethicsApprovalRef || 'Não informada no estudo'}
                    tone={selectedStudy?.config?.ethicsApprovalRef ? 'success' : 'warning'}
                  />
                  <ReviewRow label="Código de pesquisa" value={form.external_code.trim().toUpperCase()} mono />
                  <ReviewRow label="Grupo ou coorte" value={form.cohort || 'Não informado'} />
                  <ReviewRow label="Faixa etária" value={form.age_range || 'Não informada'} />
                  <ReviewRow
                    label="Consentimento"
                    value={form.consent_status === 'accepted'
                      ? `Aceito · versão ${form.consent_version.trim()}`
                      : 'Pendente'}
                    tone={form.consent_status === 'accepted' ? 'success' : 'warning'}
                  />
                  <ReviewRow label="Elegibilidade" value="Conferida" tone="success" />
                  <ReviewRow label="Proteção de identidade" value="Confirmada" tone="success" />
                </dl>

                <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <ShieldCheck className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
                  <p className="text-sm leading-relaxed">
                    O registro será pseudonimizado. A chave de reidentificação, quando existir, deve
                    permanecer em repositório separado e sob controle da equipe autorizada.
                  </p>
                </div>
              </section>
            )}

            {createParticipant.isError && (
              <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" role="alert">
                Não foi possível registrar o participante: {(createParticipant.error as Error).message}
              </p>
            )}
          </div>

          <DialogFooter className="mt-0 flex-row items-center justify-between gap-3 border-t border-border bg-surface px-5 py-4 sm:px-7">
            <div>
              {step > 0 && (
                <ActionButton type="button" variant="ghost" onClick={() => setStep((current) => current - 1)}>
                  <ChevronLeft size={16} aria-hidden="true" />
                  Voltar
                </ActionButton>
              )}
            </div>
            <div className="flex items-center gap-2">
              <ActionButton type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancelar
              </ActionButton>
              {step < STEPS.length - 1 ? (
                <ActionButton type="submit" variant="primary" disabled={!canContinue}>
                  Continuar
                  <ChevronRight size={16} aria-hidden="true" />
                </ActionButton>
              ) : (
                <ActionButton type="submit" variant="primary" disabled={createParticipant.isPending}>
                  {createParticipant.isPending ? 'Registrando…' : 'Registrar participante'}
                </ActionButton>
              )}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const fieldClassName = 'h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-text-primary outline-none transition placeholder:text-text-disabled focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-surface-muted dark:focus:ring-blue-950';

function SectionHeading({
  id,
  eyebrow,
  title,
  description,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">{eyebrow}</p>
      <h3 id={id} className="mt-1 text-lg font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-secondary">{description}</p>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-text-primary">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-text-muted">{hint}</p>}
    </div>
  );
}

function StudyFact({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{label}</p>
      <p className={cn('mt-1 truncate font-medium text-text-primary', warning && 'text-amber-700 dark:text-amber-300')} title={value}>
        {value}
      </p>
    </div>
  );
}

function ConsentOption({
  checked,
  title,
  description,
  onChange,
}: {
  checked: boolean;
  title: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer gap-3 rounded-xl border p-4 transition',
        checked
          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:bg-blue-950/30'
          : 'border-border bg-surface hover:border-border-strong',
      )}
    >
      <input type="radio" name="consent-status" checked={checked} onChange={onChange} className="mt-1 accent-blue-600" />
      <span>
        <span className="block text-sm font-semibold text-text-primary">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-text-secondary">{description}</span>
      </span>
    </label>
  );
}

function Attestation({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-4 rounded accent-blue-600"
      />
      <span>
        <span className="block text-sm font-semibold text-text-primary">{title} <span className="text-red-600">*</span></span>
        <span className="mt-0.5 block text-xs leading-relaxed text-text-secondary">{description}</span>
      </span>
    </label>
  );
}

function ReviewRow({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'success' | 'warning';
}) {
  return (
    <div className="grid gap-1 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[180px_1fr] sm:items-center">
      <dt className="text-xs font-medium text-text-muted">{label}</dt>
      <dd
        className={cn(
          'text-sm font-semibold text-text-primary',
          mono && 'font-mono tracking-wide',
          tone === 'success' && 'text-emerald-700 dark:text-emerald-300',
          tone === 'warning' && 'text-amber-700 dark:text-amber-300',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
