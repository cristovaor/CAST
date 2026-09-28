import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { useParticipants } from "@/features/participants/useParticipants";

// Session forms are modality-agnostic (docs §7–8). No pre/post-test is assumed;
// tests/questionnaires are just one optional data source among many.

export function SessionInfoForm({ defaultValues, onNext, pending }: { defaultValues: Record<string, unknown>, onNext: (data: Record<string, unknown>) => void, pending?: boolean }) {
  const { t } = useTranslation("sessions");
  const { register, handleSubmit, formState: { errors } } = useForm({ defaultValues });
  const { data: participantsData, isLoading } = useParticipants();

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-lg font-medium">{t("wizard.info.title")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="session-participant" className="text-sm font-medium">{t("wizard.info.participant")}</label>
            <select id="session-participant" aria-invalid={!!errors.participantId} {...register("participantId", { required: true })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" disabled={isLoading}>
              <option value="">{t("wizard.info.selectParticipant")}</option>
              {participantsData?.items?.filter((participant) => participant.is_active).map(p => (
                <option key={p.id} value={p.id}>{p.external_code}</option>
              ))}
            </select>
            {errors.participantId && <span role="alert" className="text-xs text-destructive">{t("wizard.info.participantRequired")}</span>}
          </div>
          <div className="space-y-2">
            <label htmlFor="session-condition" className="text-sm font-medium">{t("wizard.info.condition")}</label>
            <input id="session-condition" {...register("condition")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder={t("wizard.info.conditionPlaceholder")} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="session-operator" className="text-sm font-medium">{t("wizard.info.operator")}</label>
            <input id="session-operator" {...register("operator")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder={t("wizard.info.operatorPlaceholder")} />
          </div>
          <div className="space-y-2">
            <label htmlFor="session-protocol" className="text-sm font-medium">{t("wizard.info.protocol")}</label>
            <input id="session-protocol" {...register("protocol")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder={t("wizard.info.protocolPlaceholder")} />
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50">
          {pending ? t("wizard.info.creating") : t("wizard.info.next")}
        </button>
      </div>
    </form>
  );
}

// Optional auxiliary data (tests, questionnaires, scales) — never required.
export function AuxiliaryDataForm({ defaultValues, onNext, onBack }: { defaultValues: Record<string, unknown>, onNext: (data: Record<string, unknown>) => void, onBack: () => void }) {
  const { t } = useTranslation("sessions");
  const { register, handleSubmit } = useForm({ defaultValues });
  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-lg font-medium">{t("wizard.aux.title")} <span className="text-sm font-normal text-muted-foreground">{t("wizard.aux.optional")}</span></h3>
        <p className="text-sm text-muted-foreground">{t("wizard.aux.description")}</p>
        <div className="space-y-2">
          <label htmlFor="session-aux-instrument" className="text-sm font-medium">{t("wizard.aux.instrument")}</label>
          <input id="session-aux-instrument" {...register("auxInstrument")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder={t("wizard.aux.instrumentPlaceholder")} />
        </div>
        <div className="space-y-2">
          <label htmlFor="session-aux-notes" className="text-sm font-medium">{t("wizard.aux.notes")}</label>
          <textarea id="session-aux-notes" {...register("auxNotes")} className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="flex justify-between gap-3">
        <button type="button" onClick={onBack} className="px-4 py-2 hover:bg-muted rounded-md text-sm font-medium border border-input">{t("wizard.aux.back")}</button>
        <div className="flex gap-3">
          <button type="button" onClick={() => onNext({})} className="px-4 py-2 bg-surface-muted hover:bg-surface-muted text-text-secondary rounded-md text-sm font-medium">{t("wizard.aux.skip")}</button>
          <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium">{t("wizard.aux.next")}</button>
        </div>
      </div>
    </form>
  );
}
