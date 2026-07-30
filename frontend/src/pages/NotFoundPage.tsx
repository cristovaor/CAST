import { useLocation, useNavigate } from 'react-router-dom';
import { Compass, ArrowLeft, Home } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';

export function NotFoundPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-text-muted">
          <Compass size={22} />
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">
          Erro 404
        </p>
        <h1 className="mt-2 text-lg font-semibold text-text-primary">
          Página não encontrada
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-text-secondary">
          O endereço acessado não existe ou o recurso foi removido.
        </p>

        <p className="mt-3 truncate rounded-lg bg-surface-muted px-3 py-2 font-mono text-[11px] text-text-muted">
          {pathname}
        </p>

        <div className="mt-6 flex items-center justify-center gap-2">
          <ActionButton icon={ArrowLeft} onClick={() => navigate(-1)}>
            Voltar
          </ActionButton>
          <ActionButton variant="primary" icon={Home} onClick={() => navigate('/app')}>
            Ir para o início
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
