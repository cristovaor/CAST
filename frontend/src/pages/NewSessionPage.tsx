import { useTranslation } from "react-i18next";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SessionWizardLayout } from "@/features/sessions/SessionWizardLayout";

export function NewSessionPage() {
  const { t } = useTranslation("sessions");
  const { studyId } = useParams();

  return (
    <div className="flex flex-col space-y-6">
      <div>
        <Link to={`/app/studies/${studyId}/sessions`} className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("create.back")}
        </Link>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("create.title")}</h2>
          <p className="text-muted-foreground">{t("create.description")}</p>
        </div>
      </div>

      <div className="py-4">
        <SessionWizardLayout studyId={studyId || ""} />
      </div>
    </div>
  );
}
