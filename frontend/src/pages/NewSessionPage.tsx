import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SessionWizardLayout } from "@/features/sessions/SessionWizardLayout";

export function NewSessionPage() {
  const { studyId } = useParams();

  return (
    <div className="flex flex-col space-y-6">
      <div>
        <Link to={`/app/studies/${studyId}/sessions`} className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para Sessões
        </Link>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Nova Sessão</h2>
          <p className="text-muted-foreground">Adicione uma nova gravação para processamento.</p>
        </div>
      </div>

      <div className="py-4">
        <SessionWizardLayout studyId={studyId || ""} />
      </div>
    </div>
  );
}
