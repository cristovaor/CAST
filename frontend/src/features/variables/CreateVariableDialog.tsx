import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translate } from '@/i18n/labels';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import { useCreateVariable } from '@/features/multimodal/useMultimodal';

// Create a scientific variable (docs §14). Distinguishes role and origin so the
// analysis plan stays explicit (independent/dependent/covariate; raw/feature/
// event/model output…).

const ROLES = [
  'independent', 'dependent', 'covariate', 'confounder', 'moderator', 'mediator',
  'primary_outcome', 'secondary_outcome', 'exploratory',
] as const;

const ORIGINS = [
  'raw_video', 'raw_eeg', 'video_feature', 'eeg_feature', 'event', 'annotation',
  'questionnaire', 'test', 'experimental', 'derived', 'model_output', 'statistic',
] as const;

const TYPES = ['numeric', 'categorical', 'ordinal', 'boolean', 'datetime', 'text'] as const;

export function CreateVariableDialog({ studyId, children }: { studyId?: string; children: React.ReactNode }) {
  const { t } = useTranslation('studies');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '', code: '', var_type: 'numeric', unit: '', origin: 'derived',
    granularity: '', modality: '', computation_method: '', role: 'exploratory',
  });
  const create = useCreateVariable(studyId);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studyId) return;
    create.mutate(
      { study_id: studyId, ...form, validation_status: 'draft' },
      { onSuccess: () => { setOpen(false); setForm({ ...form, name: '', code: '' }); } },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('variables.form.title')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          {!studyId && (
            <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-900">
              {t('variables.form.noStudy')}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('variables.form.name')} required value={form.name} onChange={set('name')} placeholder={t('variables.form.namePlaceholder')} />
            <Field label={t('variables.form.code')} required value={form.code} onChange={set('code')} placeholder={t('variables.form.codePlaceholder')} mono />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Select label={t('variables.form.type')} value={form.var_type} onChange={set('var_type')} options={TYPES.map((v) => [v, t(`variables.types.${v}`)] as const)} />
            <Field label={t('variables.form.unit')} value={form.unit} onChange={set('unit')} placeholder="µV²/Hz" />
            <Field label={t('variables.form.granularity')} value={form.granularity} onChange={set('granularity')} placeholder={t('variables.form.granularityPlaceholder')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label={t('variables.form.role')} value={form.role} onChange={set('role')} options={ROLES.map((v) => [v, translate(`domain:variableRole.${v}`)] as const)} />
            <Select label={t('variables.form.origin')} value={form.origin} onChange={set('origin')} options={ORIGINS.map((v) => [v, translate(`domain:variableOrigin.${v}`)] as const)} />
          </div>
          <Field label={t('variables.form.computation')} value={form.computation_method} onChange={set('computation_method')} placeholder={t('variables.form.computationPlaceholder')} />

          <DialogFooter>
            <ActionButton variant="ghost" onClick={() => setOpen(false)} type="button">{t('variables.form.cancel')}</ActionButton>
            <ActionButton variant="primary" type="submit" disabled={create.isPending || !studyId}>
              {create.isPending ? t('variables.form.creating') : t('variables.form.create')}
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, placeholder, required, mono }: {
  label: string; value: string; onChange: React.ChangeEventHandler<HTMLInputElement>;
  placeholder?: string; required?: boolean; mono?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-text-secondary">{label}</label>
      <input
        id={id}
        required={required} value={value} onChange={onChange} placeholder={placeholder}
        className={`w-full px-3 py-2 border border-border rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: React.ChangeEventHandler<HTMLSelectElement>;
  options: readonly (readonly [string, string])[];
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-text-secondary">{label}</label>
      <select id={id} value={value} onChange={onChange} className="w-full px-3 py-2 border border-border rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
