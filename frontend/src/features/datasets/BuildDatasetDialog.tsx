import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import { usePreviewDataset, useBuildDataset, useCreateDataset, type DatasetBuildCriteria } from '@/features/multimodal/useMultimodal';
import { Check } from 'lucide-react';

// Configure inclusion/exclusion criteria, preview the selection, then
// materialize the dataset (docs §17, fluxo 6). The preview is a dry-run: it
// reports how many sessions pass and why others are excluded (lineage), before
// anything is built.

const MODALITIES = [['video', 'Vídeo'], ['eeg', 'EEG']] as const;

export function BuildDatasetDialog({ datasetId, children }: { datasetId?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [criteria, setCriteria] = useState<DatasetBuildCriteria>({
    modalities: ['video', 'eeg'],
    require_consent: true,
    require_sync: false,
    min_eeg_valid_ratio: null,
  });

  const preview = usePreviewDataset();
  const create = useCreateDataset();
  const build = useBuildDataset();

  const toggleModality = (m: string) =>
    setCriteria((c) => {
      const cur = c.modalities ?? [];
      return { ...c, modalities: cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m] };
    });

  const runBuild = async () => {
    try {
      const id = datasetId ?? (
        await create.mutateAsync({
          name: name.trim(),
          dataset_version: version.trim(),
          level: 'analytic',
          manifest: {},
        })
      ).id;
      await build.mutateAsync({ datasetId: id, criteria });
      setOpen(false);
    } catch {
      // Mutation errors are rendered below.
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Construir dataset</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!datasetId && (
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Nome
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Dataset multimodal"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Versão
                <input
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </label>
            </div>
          )}
          {/* Modalities */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Modalidades obrigatórias</label>
            <div className="mt-2 flex gap-2">
              {MODALITIES.map(([v, l]) => {
                const on = (criteria.modalities ?? []).includes(v);
                return (
                  <button
                    key={v}
                    onClick={() => toggleModality(v)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] transition-colors ${on ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    {on && <Check size={13} />} {l}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Gates */}
          <div className="space-y-2">
            <Toggle
              label="Exigir consentimento ativo"
              checked={!!criteria.require_consent}
              onChange={(v) => setCriteria((c) => ({ ...c, require_consent: v }))}
            />
            <Toggle
              label="Exigir sincronização aprovada"
              checked={!!criteria.require_sync}
              onChange={(v) => setCriteria((c) => ({ ...c, require_sync: v }))}
            />
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-slate-700">EEG válido mínimo</span>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={100} step={5}
                  value={criteria.min_eeg_valid_ratio != null ? Math.round(criteria.min_eeg_valid_ratio * 100) : ''}
                  onChange={(e) => setCriteria((c) => ({ ...c, min_eeg_valid_ratio: e.target.value === '' ? null : Number(e.target.value) / 100 }))}
                  placeholder="—"
                  className="w-16 rounded-md border border-slate-200 px-2 py-1 text-sm text-right focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <span className="text-[12px] text-slate-400">%</span>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-slate-700">Prévia da seleção</span>
              <button
                onClick={() => preview.mutate(criteria)}
                disabled={preview.isPending}
                className="text-[12px] text-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                {preview.isPending ? 'Calculando…' : 'Calcular prévia'}
              </button>
            </div>
            {preview.data && (
              <div className="mt-2 text-[12px] text-slate-600 space-y-1">
                <p><strong className="text-emerald-700">{preview.data.included}</strong> sessões incluídas · <strong className="text-slate-500">{preview.data.excluded}</strong> excluídas · {preview.data.participant_count} participantes</p>
                {preview.data.conditions.length > 0 && <p>Condições: {preview.data.conditions.join(', ')}</p>}
                {preview.data.excluded_sample.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-slate-500">Motivos de exclusão</summary>
                    <ul className="mt-1 pl-3 space-y-0.5">
                      {preview.data.excluded_sample.slice(0, 8).map((e, i) => (
                        <li key={i} className="text-[11px] text-slate-500">{e.session_id.slice(0, 8)}: {e.reason}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>

          <ScientificCaveat variant="privacy" compact />
          {(build.isError || create.isError) && (
            <p className="text-[12px] text-red-600">
              Falha ao construir: {((build.error || create.error) as Error).message}
            </p>
          )}
        </div>

        <DialogFooter>
          <ActionButton variant="ghost" onClick={() => setOpen(false)} type="button">Cancelar</ActionButton>
          <ActionButton
            variant="primary"
            onClick={runBuild}
            disabled={build.isPending || create.isPending || (!datasetId && (!name.trim() || !version.trim()))}
          >
            {build.isPending || create.isPending ? 'Construindo…' : 'Construir dataset'}
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-[13px] text-slate-700">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </label>
  );
}
