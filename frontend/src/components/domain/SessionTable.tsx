import { FileVideo, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import type { JobStatus } from "@/types/domain";

export interface Session {
  id: string;
  participantCode: string;
  lessonName: string;
  date: string;
  jobStatus: JobStatus;
  qualityWarning?: boolean;
}

interface SessionTableProps {
  sessions: Session[];
}

export function SessionTable({ sessions }: SessionTableProps) {
  const getStatusDisplay = (status: JobStatus, warning?: boolean) => {
    switch (status) {
      case 'succeeded':
        if (warning) {
          return (
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              <span>Concluído c/ ressalvas</span>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="h-4 w-4" />
            <span>Concluído</span>
          </div>
        );
      case 'running':
      case 'queued':
        return (
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <Clock className="h-4 w-4 animate-pulse" />
            <span>Processando</span>
          </div>
        );
      case 'failed':
        return (
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>Falhou</span>
          </div>
        );
      default:
        return <span className="text-muted-foreground capitalize">{status}</span>;
    }
  };

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm text-left">
        <thead className="bg-muted/50 text-muted-foreground border-b">
          <tr>
            <th scope="col" className="h-12 px-4 font-medium">Participante</th>
            <th scope="col" className="h-12 px-4 font-medium">Aula/Material</th>
            <th scope="col" className="h-12 px-4 font-medium">Data</th>
            <th scope="col" className="h-12 px-4 font-medium">Processamento</th>
            <th scope="col" className="h-12 px-4 font-medium text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {sessions.length === 0 ? (
            <tr>
              <td colSpan={5} className="h-24 text-center text-muted-foreground">
                Nenhuma sessão cadastrada.
              </td>
            </tr>
          ) : (
            sessions.map((s) => (
              <tr key={s.id} className="border-b transition-colors hover:bg-muted/50">
                <td className="p-4 font-medium">{s.participantCode}</td>
                <td className="p-4">{s.lessonName}</td>
                <td className="p-4">{s.date}</td>
                <td className="p-4">{getStatusDisplay(s.jobStatus, s.qualityWarning)}</td>
                <td className="p-4 text-right">
                  <div className="flex justify-end gap-3">
                    <button className="text-muted-foreground hover:text-primary transition-colors">
                      <FileVideo className="h-4 w-4" />
                    </button>
                    <button className="text-primary hover:underline font-medium text-sm">
                      Detalhes
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
