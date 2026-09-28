import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Stepper } from "@/components/ui/Stepper";
import { SessionInfoForm, AuxiliaryDataForm } from "./SessionForms";
import { VideoUploadCard } from "@/components/upload/VideoUploadCard";
import { ScientificCaveat } from "@/components/ui/ScientificCaveat";
import { CheckCircle2, Activity, Video, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EEG_FORMATS } from "@/types/research";
import { useCreateSession } from "@/features/multimodal/useMultimodal";
import { useUploadEEG } from "@/features/eeg/useEEG";

// Session collection flow (docs §7, fluxo 2). The session is persisted first,
// then video and EEG are attached to it (equivalent core modalities). Auxiliary
// tests/questionnaires are optional. Nothing forces a pre/post-test structure.

const STEP_IDS = ["info", "video", "eeg", "aux", "review"] as const;

interface WizardData {
  participantId?: string;
  condition?: string;
  protocol?: string;
  operator?: string;
  sessionId?: string;
  videoId?: string;
  eegId?: string;
  eegAttached?: boolean;
  [key: string]: unknown;
}

export function SessionWizardLayout({ studyId }: { studyId: string }) {
  const { t } = useTranslation("sessions");
  const STEPS = STEP_IDS.map((id) => ({ id, name: t(`wizard.steps.${id}`) }));
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<WizardData>({});
  const navigate = useNavigate();

  const createSession = useCreateSession();
  const uploadEEG = useUploadEEG();

  const merge = (data: Partial<WizardData>) => setFormData((prev) => ({ ...prev, ...data }));
  const goNext = () => setCurrentStep((s) => s + 1);
  const handleBack = () => setCurrentStep((s) => s - 1);

  // Step 0 → persist the session, then advance carrying its id.
  const handleInfoNext = async (data: Record<string, unknown>) => {
    merge(data);
    try {
      const session = await createSession.mutateAsync({
        participant_id: String(data.participantId),
        condition: data.condition ? String(data.condition) : undefined,
        protocol: data.protocol ? String(data.protocol) : undefined,
        operator: data.operator ? String(data.operator) : undefined,
      });
      merge({ sessionId: session.id });
      goNext();
    } catch {
      // Surface via the button's disabled/error state; keep the user on step 0.
    }
  };

  const handleVideoDone = (videoId: string, sessionId: string) => {
    merge({ videoId, sessionId });
    goNext();
  };

  const handleEEGFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !formData.participantId) return;
    try {
      const res = await uploadEEG.mutateAsync({
        participant_id: formData.participantId,
        session_id: formData.sessionId,
        file,
      });
      merge({ eegId: res.eeg_asset_id, eegAttached: true });
      goNext();
    } catch {
      // stay on step; the input can be retried
    }
  };

  const attachedModalities = [
    formData.videoId ? t("wizard.done.video") : null,
    formData.eegAttached ? "EEG" : null,
  ].filter(Boolean);
  const attachedSummary = attachedModalities.length ? ` (${attachedModalities.join(" + ")})` : "";

  const submitSession = () => {
    // The session's state is derived automatically from what was actually
    // attached (video/EEG uploads already refreshed it server-side) — the
    // wizard doesn't need to force a state here.
    navigate(formData.sessionId ? `/app/sessions/${formData.sessionId}` : `/app/studies/${studyId}/sessions`);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8"><Stepper steps={STEPS} currentStep={currentStep} /></div>

      <div className="rounded-xl border bg-card p-6 md:p-8 shadow-sm">
        {currentStep === 0 && (
          <SessionInfoForm defaultValues={formData} onNext={handleInfoNext} pending={createSession.isPending} />
        )}

        {currentStep === 1 && (
          <div className="space-y-6">
            <ModalityHeader icon={Video} tone="blue" title={t("wizard.video.title")} subtitle={t("wizard.video.subtitle")} />
            <VideoUploadCard participantId={formData.participantId} sessionId={formData.sessionId} onUploadCompleted={handleVideoDone} />
            <NavRow onBack={handleBack} onSkip={goNext} skipLabel={t("wizard.video.skip")} />
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6">
            <ModalityHeader icon={Activity} tone="cyan" title={t("wizard.eeg.title")} subtitle={t("wizard.eeg.subtitle")} />
            <label className="border-2 border-dashed border-border rounded-xl p-10 flex flex-col items-center justify-center text-center bg-app-bg hover:bg-surface-muted transition-colors cursor-pointer">
              {uploadEEG.isPending ? (
                <Loader2 className="h-10 w-10 text-text-muted mb-4 animate-spin" />
              ) : (
                <Activity className="h-10 w-10 text-text-muted mb-4" />
              )}
              <p className="text-sm font-medium text-text-secondary">{uploadEEG.isPending ? t("wizard.eeg.uploading") : t("wizard.eeg.select")}</p>
              <p className="text-xs text-text-muted mt-1">{EEG_FORMATS.join(" · ")}</p>
              <input type="file" className="hidden" accept=".xdf,.edf,.bdf,.csv,.fif,.vhdr,.set,.txt" onChange={handleEEGFile} disabled={uploadEEG.isPending} />
            </label>
            <p className="text-[12px] text-text-muted">{t("wizard.eeg.afterUpload")}</p>
            <NavRow onBack={handleBack} onSkip={() => { merge({ eegAttached: false }); goNext(); }} skipLabel={t("wizard.eeg.skip")} />
          </div>
        )}

        {currentStep === 3 && <AuxiliaryDataForm defaultValues={formData} onNext={(d) => { merge(d); goNext(); }} onBack={handleBack} />}

        {currentStep === 4 && (
          <div className="space-y-6 text-center py-6">
            <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto" aria-hidden="true" />
            <h3 className="text-2xl font-bold">{t("wizard.done.title")}</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {t("wizard.done.body", { attached: attachedSummary })}
            </p>
            <div className="max-w-md mx-auto text-left"><ScientificCaveat variant="privacy" compact /></div>
            <div className="flex justify-center gap-4 mt-6">
              <button type="button" onClick={handleBack} className="px-4 py-2 hover:bg-muted rounded-md text-sm font-medium border border-input">{t("wizard.done.back")}</button>
              <button
                type="button"
                onClick={submitSession}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-medium shadow-sm transition-colors"
              >
                {t("wizard.done.open")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ModalityHeader({ icon: Icon, title, subtitle, tone }: { icon: typeof Video; title: string; subtitle: string; tone: 'blue' | 'cyan' }) {
  const c = tone === 'blue'
    ? 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300'
    : 'bg-cyan-100 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-300';
  return (
    <div className="flex items-center gap-3">
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${c}`}><Icon size={22} aria-hidden="true" /></div>
      <div>
        <h3 className="text-lg font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function NavRow({ onBack, onNext, onSkip, skipLabel }: { onBack: () => void; onNext?: () => void; onSkip?: () => void; skipLabel?: string }) {
  const { t } = useTranslation("sessions");
  return (
    <div className="flex justify-between items-center pt-4 border-t">
      <button type="button" onClick={onBack} className="px-4 py-2 hover:bg-muted rounded-md text-sm font-medium border border-input">{t("wizard.back")}</button>
      <div className="flex gap-3">
        {onSkip && <button type="button" onClick={onSkip} className="px-4 py-2 bg-surface-muted hover:bg-surface-muted text-text-secondary rounded-md text-sm font-medium">{skipLabel ?? t("wizard.skip")}</button>}
        {onNext && <button type="button" onClick={onNext} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium">{t("wizard.next")}</button>}
      </div>
    </div>
  );
}
