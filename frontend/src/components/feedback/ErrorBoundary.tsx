import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, RotateCcw, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  children: ReactNode;
  /** Optional custom fallback; receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Remounts the boundary when any of these values change (e.g. route key). */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/lifecycle errors below it so a single broken component does
 * not blank the whole application. Note: React error boundaries do not catch
 * errors in event handlers or async code — those surface via toasts instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    // Clear the error when navigating elsewhere, so the user is not stuck.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept as console output until a telemetry sink (Sentry et al.) is wired.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div
          role="alert"
          className={cn(
            'w-full max-w-lg rounded-xl border border-border bg-surface p-6 text-center shadow-card',
          )}
        >
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertOctagon size={20} />
          </div>

          <h2 className="text-base font-semibold text-text-primary">
            Algo deu errado nesta tela
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-text-secondary">
            Ocorreu um erro inesperado ao renderizar esta página. Seus dados não
            foram perdidos — você pode tentar novamente ou voltar ao início.
          </p>

          <pre
            className={cn(
              'mt-4 max-h-32 overflow-auto rounded-lg bg-surface-muted p-3 text-left',
              'font-mono text-[11px] leading-relaxed text-text-secondary',
            )}
          >
            {error.message || String(error)}
          </pre>

          <div className="mt-5 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={this.reset}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2',
                'text-sm font-medium text-white transition-colors hover:bg-blue-700',
              )}
            >
              <RotateCcw size={15} aria-hidden="true" />
              Tentar novamente
            </button>
            <a
              href="/app"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2',
                'text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover',
              )}
            >
              <Home size={15} aria-hidden="true" />
              Ir para o início
            </a>
          </div>
        </div>
      </div>
    );
  }
}
