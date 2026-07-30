import { Link, Navigate, useParams } from 'react-router-dom';
import { Loader2, Upload } from 'lucide-react';
import { useSessionDetail } from '@/features/multimodal/useMultimodal';
import { Button } from '@/components/ui/Button';

export function SessionAnnotationRedirectPage() {
  const { sessionId } = useParams();
  const { data: session, isLoading, isError } = useSessionDetail(sessionId);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }
  if (session?.video_asset_id) {
    return (
      <Navigate
        to={`/app/videos/${session.video_asset_id}/annotations`}
        replace
      />
    );
  }
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-dashed border-border-strong bg-surface p-8 text-center">
        <Upload className="mx-auto mb-3 h-10 w-10 text-text-muted" />
        <h1 className="text-lg font-semibold text-text-primary">
          Esta sessão não possui vídeo
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          {isError
            ? 'Não foi possível carregar a sessão.'
            : 'Envie um vídeo para habilitar a anotação manual e os landmarks.'}
        </p>
        <Button asChild className="mt-5">
          <Link to="/app/acquisition">Abrir aquisição</Link>
        </Button>
      </div>
    </div>
  );
}
