import type { JobStreamData } from "@/features/jobs/useProcessingJobStream";
import { AlertTriangle, CheckCircle, Clock, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProcessingStatusPanelProps {
  data: JobStreamData;
  onCancel: () => void;
  onRetry: () => void;
}

const PIPELINE_STEPS = [
  "Extraindo metadados",
  "Validando qualidade",
  "Extraindo landmarks faciais",
  "Gerando janelas temporais",
  "Executando inferência",
  "Sumarizando microações",
  "Gerando relatório"
];

export function ProcessingStatusPanel({ data, onCancel, onRetry }: ProcessingStatusPanelProps) {
  const currentStepIndex = PIPELINE_STEPS.findIndex(step => step === data.currentStep);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold tracking-tight">Status do Processamento</h3>
          <p className="text-muted-foreground flex items-center gap-2 mt-1">
            {data.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
            {data.status === 'succeeded' && <CheckCircle className="h-4 w-4 text-emerald-500" />}
            {data.status === 'failed' && <XCircle className="h-4 w-4 text-destructive" />}
            {data.status === 'queued' && <Clock className="h-4 w-4 text-muted-foreground" />}
            <span className="capitalize">{data.status}</span>
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-primary">{Math.round(data.progress)}%</div>
          <span className="text-xs text-muted-foreground">Progresso Global</span>
        </div>
      </div>

      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
        <div 
          className={cn(
            "h-full transition-all duration-500",
            data.status === 'failed' ? "bg-destructive" : "bg-primary"
          )}
          style={{ width: `${data.progress}%` }}
        />
      </div>

      {data.qualityAlerts && data.qualityAlerts.length > 0 && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-400">
          <div className="flex items-center gap-2 mb-2 font-medium">
            <AlertTriangle className="h-5 w-5" />
            Alertas de Qualidade
          </div>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {data.qualityAlerts.map((alert, i) => (
              <li key={i}>{alert}</li>
            ))}
          </ul>
        </div>
      )}

      {data.errorMessage && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          <div className="flex items-center gap-2 mb-1 font-medium">
            <XCircle className="h-5 w-5" />
            Erro Fatal
          </div>
          <p className="text-sm">{data.errorMessage}</p>
        </div>
      )}

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Etapas</h4>
        <div className="space-y-4">
          {PIPELINE_STEPS.map((step, index) => {
            const isCompleted = index < currentStepIndex || data.status === 'succeeded';
            const isCurrent = index === currentStepIndex && data.status === 'running';
            const isPending = index > currentStepIndex && data.status !== 'succeeded';
            const isFailed = index === currentStepIndex && data.status === 'failed';

            return (
              <div key={step} className="flex items-start gap-3">
                <div className="mt-0.5">
                  {isCompleted && <CheckCircle className="h-5 w-5 text-emerald-500" />}
                  {isCurrent && <Loader2 className="h-5 w-5 animate-spin text-blue-500" />}
                  {isPending && <div className="h-5 w-5 rounded-full border-2 border-muted" />}
                  {isFailed && <XCircle className="h-5 w-5 text-destructive" />}
                </div>
                <div>
                  <p className={cn(
                    "text-sm font-medium",
                    isCurrent ? "text-foreground" : isPending ? "text-muted-foreground" : isFailed ? "text-destructive" : "text-foreground"
                  )}>
                    {index + 1}. {step}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t">
        {data.status !== 'succeeded' && data.status !== 'failed' && (
          <button onClick={onCancel} className="px-4 py-2 border border-input bg-background hover:bg-muted text-sm font-medium rounded-md text-destructive">
            Cancelar Processamento
          </button>
        )}
        {(data.status === 'failed' || data.status === 'canceled') && (
          <button onClick={onRetry} className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-md">
            Tentar Novamente
          </button>
        )}
      </div>
    </div>
  );
}
