import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import { useCreateVariable } from '@/features/multimodal/useMultimodal';

// Create a scientific variable (docs §14). Distinguishes role and origin so the
// analysis plan stays explicit (independent/dependent/covariate; raw/feature/
// event/model output…).

const ROLES = [
  ['independent', 'Independente'], ['dependent', 'Dependente'], ['covariate', 'Covariável'],
  ['confounder', 'Confundidor'], ['moderator', 'Moderador'], ['mediator', 'Mediador'],
  ['primary_outcome', 'Desfecho primário'], ['secondary_outcome', 'Desfecho secundário'],
  ['exploratory', 'Exploratória'],
] as const;

const ORIGINS = [
  ['raw_video', 'Vídeo bruto'], ['raw_eeg', 'EEG bruto'], ['video_feature', 'Feature de vídeo'],
  ['eeg_feature', 'Feature de EEG'], ['event', 'Evento'], ['annotation', 'Anotação'],
  ['questionnaire', 'Questionário'], ['test', 'Teste'], ['experimental', 'Variável experimental'],
  ['derived', 'Derivada'], ['model_output', 'Saída de modelo'], ['statistic', 'Cálculo estatístico'],
] as const;

const TYPES = [
  ['numeric', 'Numérica'], ['categorical', 'Categórica'], ['ordinal', 'Ordinal'],
  ['boolean', 'Booleana'], ['datetime', 'Data/hora'], ['text', 'Texto'],
] as const;

export function CreateVariableDialog({ studyId, children }: { studyId?: string; children: React.ReactNode }) {
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
          <DialogTitle>Nova variável científica</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          {!studyId && (
            <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Abra esta tela dentro de um estudo para associar a variável.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome" required value={form.name} onChange={set('name')} placeholder="Ex: Potência banda alfa" />
            <Field label="Código" required value={form.code} onChange={set('code')} placeholder="Ex: alpha_occ" mono />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Select label="Tipo" value={form.var_type} onChange={set('var_type')} options={TYPES} />
            <Field label="Unidade" value={form.unit} onChange={set('unit')} placeholder="µV²/Hz" />
            <Field label="Granularidade" value={form.granularity} onChange={set('granularity')} placeholder="janela 2s" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Papel" value={form.role} onChange={set('role')} options={ROLES} />
            <Select label="Origem" value={form.origin} onChange={set('origin')} options={ORIGINS} />
          </div>
          <Field label="Método de cálculo" value={form.computation_method} onChange={set('computation_method')} placeholder="Ex: PSD Welch 8–13 Hz, média O1/O2" />

          <DialogFooter>
            <ActionButton variant="ghost" onClick={() => setOpen(false)} type="button">Cancelar</ActionButton>
            <ActionButton variant="primary" type="submit" disabled={create.isPending || !studyId}>
              {create.isPending ? 'Criando…' : 'Criar variável'}
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
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-text-secondary">{label}</label>
      <input
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
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-text-secondary">{label}</label>
      <select value={value} onChange={onChange} className="w-full px-3 py-2 border border-border rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
