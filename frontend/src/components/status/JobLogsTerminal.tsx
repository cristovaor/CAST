import type { LogEntry } from "@/features/jobs/useProcessingJobStream";
import { cn } from "@/lib/utils";
import { Terminal } from "lucide-react";
import { useEffect, useRef } from "react";

interface JobLogsTerminalProps {
  logs: LogEntry[];
}

export function JobLogsTerminal({ logs }: JobLogsTerminalProps) {
  const endOfLogsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfLogsRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="rounded-xl border bg-black text-green-400 font-mono text-sm shadow-inner flex flex-col h-64">
      <div className="flex items-center px-4 py-2 border-b border-gray-800 bg-gray-900 rounded-t-xl text-gray-400">
        <Terminal className="h-4 w-4 mr-2" />
        <span>Terminal Output</span>
      </div>
      <div className="p-4 flex-1 overflow-y-auto space-y-1">
        {logs.length === 0 && (
          <div className="text-gray-500">Aguardando logs do processo...</div>
        )}
        {logs.map((log, index) => (
          <div key={index} className="flex gap-3">
            <span className="text-gray-500 shrink-0">[{log.timestamp}]</span>
            <span className={cn(
              "flex-1 break-words",
              log.level === 'warn' && "text-yellow-400",
              log.level === 'error' && "text-red-400"
            )}>
              {log.message}
            </span>
          </div>
        ))}
        <div ref={endOfLogsRef} />
      </div>
    </div>
  );
}
