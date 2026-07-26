import { useForm } from "react-hook-form";
import { useParticipants } from "@/features/participants/useParticipants";

// Session forms are modality-agnostic (docs §7–8). No pre/post-test is assumed;
// tests/questionnaires are just one optional data source among many.

export function SessionInfoForm({ defaultValues, onNext, pending }: { defaultValues: Record<string, unknown>, onNext: (data: Record<string, unknown>) => void, pending?: boolean }) {
  const { register, handleSubmit, formState: { errors } } = useForm({ defaultValues });
  const { data: participantsData, isLoading } = useParticipants();

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Dados da sessão</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Participante (pseudonimizado)</label>
            <select {...register("participantId", { required: true })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" disabled={isLoading}>
              <option value="">Selecione um participante…</option>
              {participantsData?.items?.filter((participant) => participant.is_active).map(p => (
                <option key={p.id} value={p.id}>{p.external_code}</option>
              ))}
            </select>
            {errors.participantId && <span className="text-xs text-destructive">Selecione o participante.</span>}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Condição experimental</label>
            <input {...register("condition")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Ex: baseline, carga alta…" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Operador de coleta</label>
            <input {...register("operator")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Responsável pela sessão" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Protocolo / tarefa</label>
            <input {...register("protocol")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Ex: tarefa de vigilância" />
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50">
          {pending ? 'Criando sessão…' : 'Próximo'}
        </button>
      </div>
    </form>
  );
}

// Optional auxiliary data (tests, questionnaires, scales) — never required.
export function AuxiliaryDataForm({ defaultValues, onNext, onBack }: { defaultValues: Record<string, unknown>, onNext: (data: Record<string, unknown>) => void, onBack: () => void }) {
  const { register, handleSubmit } = useForm({ defaultValues });
  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Dados auxiliares <span className="text-sm font-normal text-muted-foreground">(opcional)</span></h3>
        <p className="text-sm text-muted-foreground">Testes, questionários, escalas ou respostas comportamentais associados a esta sessão. Podem ser deixados em branco.</p>
        <div className="space-y-2">
          <label className="text-sm font-medium">Instrumento</label>
          <input {...register("auxInstrument")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Ex: NASA-TLX, teste de desempenho…" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Observações</label>
          <textarea {...register("auxNotes")} className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="flex justify-between gap-3">
        <button type="button" onClick={onBack} className="px-4 py-2 hover:bg-muted rounded-md text-sm font-medium border border-input">Voltar</button>
        <div className="flex gap-3">
          <button type="button" onClick={() => onNext({})} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-sm font-medium">Pular</button>
          <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium">Próximo</button>
        </div>
      </div>
    </form>
  );
}
