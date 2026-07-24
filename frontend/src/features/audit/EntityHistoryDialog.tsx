import type { ReactNode } from 'react';
import { Clock3, History } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';
import { useChangeHistory, type ChangeHistoryEntry } from './useAudit';

const ACTION_LABELS: Record<string, string> = {
  create: 'Registro criado',
  update: 'Registro atualizado',
  access: 'Dados acessados',
  export: 'Dados exportados',
  consent_change: 'Consentimento alterado',
  grant: 'Acesso concedido',
  delete: 'Exclusão solicitada',
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  description: 'Descrição',
  status: 'Status',
  external_code: 'Código',
  demographic_group: 'Grupo demográfico',
  consent_status: 'Consentimento',
  protocol_version: 'Versão do protocolo',
  config: 'Configuração científica',
  role: 'Papel',
  email: 'E-mail',
  project_id: 'Projeto',
  study_id: 'Estudo',
};

interface EntityHistoryDialogProps {
  entityType: 'project' | 'study' | 'participant' | 'user';
  entityId: string;
  title?: string;
  children?: ReactNode;
}

export function EntityHistoryDialog({
  entityType,
  entityId,
  title = 'Histórico de alterações',
  children,
}: EntityHistoryDialogProps) {
  const history = useChangeHistory(entityType, entityId);

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children ?? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition hover:bg-surface-hover"
          >
            <History size={14} />
            Histórico
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Alterações persistidas com data, responsável e valores modificados.
          </DialogDescription>
        </DialogHeader>

        {history.isLoading ? (
          <p className="py-8 text-center text-sm text-text-secondary">Carregando histórico...</p>
        ) : history.isError ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Não foi possível carregar o histórico.
          </p>
        ) : !history.data?.length ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <History size={28} className="mx-auto mb-2 text-text-disabled" />
            <p className="text-sm font-medium text-text-primary">Nenhuma alteração registrada</p>
            <p className="mt-1 text-xs text-text-secondary">As próximas edições aparecerão aqui.</p>
          </div>
        ) : (
          <ol className="space-y-3">
            {history.data.map((entry) => (
              <HistoryEntry key={entry.id} entry={entry} />
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

function HistoryEntry({ entry }: { entry: ChangeHistoryEntry }) {
  const changes = Object.entries(entry.detail.changes ?? {});
  const snapshot = Object.entries(entry.detail.snapshot ?? {});

  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-text-primary">
            {ACTION_LABELS[entry.action] ?? entry.action}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            por {entry.actor_label ?? 'Sistema'}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-xs text-text-muted">
          <Clock3 size={12} />
          {new Date(entry.created_at).toLocaleString('pt-BR')}
        </span>
      </div>

      {changes.length > 0 && (
        <dl className="mt-3 space-y-2 border-t border-border pt-3">
          {changes.map(([field, change]) => (
            <div key={field} className="grid gap-1 text-xs sm:grid-cols-[140px_1fr]">
              <dt className="font-medium text-text-secondary">{FIELD_LABELS[field] ?? field}</dt>
              <dd className="min-w-0 text-text-primary">
                <span className="text-red-600 line-through decoration-red-300">{formatValue(change.from)}</span>
                <span className="mx-2 text-text-disabled">→</span>
                <span className="font-medium text-emerald-700">{formatValue(change.to)}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      {entry.action === 'create' && snapshot.length > 0 && (
        <dl className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
          {snapshot.map(([field, value]) => (
            <div key={field} className="text-xs">
              <dt className="text-text-muted">{FIELD_LABELS[field] ?? field}</dt>
              <dd className="mt-0.5 truncate font-medium text-text-primary" title={formatValue(value)}>
                {formatValue(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  return String(value);
}
