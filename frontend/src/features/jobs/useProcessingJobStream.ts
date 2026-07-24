import { useEffect, useState } from "react";
import type { JobStatus } from "@/types/domain";

export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
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

export function useProcessingJobStream(
  jobId: string,
  streamPath: (id: string) => string = (id) => `/jobs/${id}/stream`,
) {
  const [data, setData] = useState<JobStreamData>({
    status: "queued",
    progress: 0,
    currentStep: "Aguardando na fila...",
    logs: [],
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const baseUrl =
      (import.meta.env.VITE_API_URL as string | undefined) ??
      "http://localhost:8080/api/v1";
    const controller = new AbortController();
    const token = localStorage.getItem("cast_token");

    async function connect() {
      try {
        const response = await fetch(`${baseUrl}${streamPath(jobId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            const dataLine = event
              .split("\n")
              .find((line) => line.startsWith("data: "));
            if (!dataLine) continue;
            const payload: Partial<JobStreamData> & { error?: string } =
              JSON.parse(dataLine.slice(6));
            if (payload.error) throw new Error(payload.error);
            setData((previous) => ({
              ...previous,
              ...payload,
              logs: payload.logs
                ? [...previous.logs, ...payload.logs]
                : previous.logs,
            }));
          }
        }
      } catch (streamError) {
        if (controller.signal.aborted) return;
        console.error("SSE Error:", streamError);
        setError("Falha ao acompanhar o processamento. Tente novamente.");
      }
    }

    void connect();
    return () => controller.abort();
  }, [jobId]);

  return { data, error };
}
