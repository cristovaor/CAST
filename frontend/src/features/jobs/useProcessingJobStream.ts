import { useEffect, useState } from "react";
import type { JobStatus } from "@/types/domain";

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface JobStreamData {
  status: JobStatus;
  progress: number;
  currentStep: string;
  logs: LogEntry[];
  errorMessage?: string;
  qualityAlerts?: string[];
}

export function useProcessingJobStream(jobId: string) {
  const [data, setData] = useState<JobStreamData>({
    status: 'queued',
    progress: 0,
    currentStep: 'Aguardando na fila...',
    logs: [],
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    // Conexão SSE Real conforme solicitado
    const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080/api/v1';
    const eventSource = new EventSource(`${BASE_URL}/jobs/${jobId}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const payload: Partial<JobStreamData> = JSON.parse(event.data);
        setData(prev => ({
          ...prev,
          ...payload,
          logs: payload.logs ? [...prev.logs, ...payload.logs] : prev.logs
        }));
      } catch (err) {
        console.error("Failed to parse SSE payload", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE Error:", err);
      setError("Falha ao conectar na stream do Job. O backend não está respondendo.");
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [jobId]);

  return { data, error };
}
