import { useModelTestRunStatus, type ModelTestVideoResult } from './useModelTesting';
import { Badge } from '@/components/ui/Badge';

function VideoResultCard({ result }: { result: ModelTestVideoResult }) {
  if (result.status === 'landmarks_not_ready') {
    return (
      <div className="border border-amber-200 bg-amber-50 rounded-md p-3 text-sm text-amber-700">
        Vídeo {result.video_asset_id}: landmarks ainda não prontos — processe o vídeo antes de testar.
      </div>
    );
  }

  if (result.status === 'error') {
    return (
      <div className="border border-red-200 bg-red-50 rounded-md p-3 text-sm text-red-700">
        Vídeo {result.video_asset_id}: {result.error}
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-md p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 truncate">{result.video_asset_id}</span>
        <Badge>{result.event_count} evento{result.event_count === 1 ? '' : 's'}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-slate-500">
        <span>Confiança média: {result.avg_confidence?.toFixed(3)}</span>
        <span>Eventos/min: {result.events_per_minute?.toFixed(2)}</span>
        <span>Latência: {result.latency_ms?.toFixed(0)}ms</span>
      </div>
      {result.events && result.events.length > 0 && (
        <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 border-t border-slate-100 pt-2">
          {result.events.map((event, idx) => (
            <div key={idx} className="flex items-center justify-between py-1 text-xs text-slate-600">
              <span>{(event.start_ms / 1000).toFixed(2)}s → {(event.end_ms / 1000).toFixed(2)}s</span>
              <span className="text-slate-400">conf. {event.avg_confidence.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ModelTestResultView({ jobId }: { jobId: string }) {
  const { data, isLoading } = useModelTestRunStatus(jobId);

  if (isLoading || !data) {
    return <div className="text-sm text-slate-400">Carregando status do teste...</div>;
  }

  if (data.status === 'queued' || data.status === 'running') {
    return (
      <div className="space-y-2">
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${data.progress}%` }} />
        </div>
        <p className="text-xs text-slate-500 font-mono">{data.step}</p>
      </div>
    );
  }

  if (data.status === 'failed') {
    return (
      <div className="border border-red-200 bg-red-50 rounded-md p-3 text-sm text-red-700">
        Falha no teste: {data.error}
      </div>
    );
  }

  const results = data.result?.results ?? [];

  return (
    <div className="space-y-3">
      {results.map(result => (
        <VideoResultCard key={result.video_asset_id} result={result} />
      ))}
      {results.length === 0 && (
        <p className="text-sm text-slate-400">Sem resultados.</p>
      )}
    </div>
  );
}
