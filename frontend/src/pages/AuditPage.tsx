import { useMemo, useState } from 'react';
import { AlertCircle, Download, ShieldCheck } from 'lucide-react';
import { ListFilterBar } from '@/components/data-display/ListFilterBar';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { useChangeHistory, type ChangeHistoryEntry } from '@/features/audit/useAudit';

const ACTION_LABELS: Record<string, string> = {
  create: 'Criação',
  update: 'Atualização',
  access: 'Acesso',
  export: 'Exportação',
  consent_change: 'Consentimento',
  grant: 'Concessão de acesso',
  delete: 'Exclusão',
  sync_decision: 'Decisão de sincronização',
  dataset_freeze: 'Congelamento de dataset',
};

const ENTITY_LABELS: Record<string, string> = {
  project: 'Projeto',
  study: 'Estudo',
  participant: 'Participante',
  user: 'Usuário',
  session: 'Sessão',
  video: 'Vídeo',
  dataset: 'Dataset',
};

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function exportHistoryCsv(entries: ChangeHistoryEntry[]) {
  const header = ['Data', 'Ação', 'Entidade', 'ID', 'Responsável', 'Detalhes'];
  const rows = entries.map((entry) => [
    new Date(entry.created_at).toISOString(),
    ACTION_LABELS[entry.action] ?? entry.action,
    ENTITY_LABELS[entry.entity_type] ?? entry.entity_type,
    entry.entity_id,
    entry.actor_label ?? 'Sistema',
    JSON.stringify(entry.detail),
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `historico-alteracoes-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function AuditPage() {
  const history = useChangeHistory();
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const entries = history.data ?? [];

  const actions = useMemo(
    () => [...new Set(entries.map((entry) => entry.action))].sort(),
    [entries],
  );
  const entityTypes = useMemo(
    () => [...new Set(entries.map((entry) => entry.entity_type))].sort(),
    [entries],
  );
  const filteredEntries = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return entries.filter((entry) => {
      const matchesSearch = !term || [
        entry.actor_label,
        entry.entity_id,
        ENTITY_LABELS[entry.entity_type],
        ACTION_LABELS[entry.action],
        JSON.stringify(entry.detail),
      ].some((value) => value?.toLocaleLowerCase('pt-BR').includes(term));
      return matchesSearch && (!action || entry.action === action) && (!entityType || entry.entity_type === entityType);
    });
  }, [action, entityType, entries, search]);

  return (
    <div className="min-h-full">
      <PageHeader
        title="Histórico e Auditoria"
        description="Trilha de criação, atualização e acesso aos registros da organização."
        actions={
          <button
            type="button"
            onClick={() => exportHistoryCsv(filteredEntries)}
            disabled={!filteredEntries.length}
            className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-secondary shadow-sm transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={16} />
            Exportar CSV
          </button>
        }
      />

      <div className="space-y-4 p-6">
        {history.isLoading ? (
          <div className="flex justify-center p-12">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        ) : history.isError ? (
          <EmptyState
            variant="error"
            title="Erro ao carregar"
            description="Não foi possível carregar o histórico de auditoria."
            icon={<AlertCircle size={40} className="text-red-400" />}
          />
        ) : entries.length === 0 ? (
          <EmptyState
            variant="empty"
            title="Sem registros recentes"
            description="Criações, edições e acessos passarão a aparecer aqui."
            icon={<ShieldCheck size={40} className="text-text-disabled" />}
          />
        ) : (
          <>
            <ListFilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Buscar por responsável, entidade, ID ou alteração..."
              resultCount={filteredEntries.length}
              totalCount={entries.length}
              resultLabel="registro"
              resultLabelPlural="registros"
              filters={[
                {
                  id: 'action',
                  label: 'Filtrar por ação',
                  value: action,
                  onChange: setAction,
                  options: [
                    { value: '', label: 'Todas as ações' },
                    ...actions.map((value) => ({ value, label: ACTION_LABELS[value] ?? value })),
                  ],
                },
                {
                  id: 'entity',
                  label: 'Filtrar por entidade',
                  value: entityType,
                  onChange: setEntityType,
                  options: [
                    { value: '', label: 'Todas as entidades' },
                    ...entityTypes.map((value) => ({ value, label: ENTITY_LABELS[value] ?? value })),
                  ],
                },
              ]}
            />

            {filteredEntries.length === 0 ? (
              <EmptyState
                variant="empty"
                title="Nenhum registro corresponde aos filtros"
                description="Ajuste a busca ou limpe os filtros para ver outros eventos."
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-muted">
                    <tr>
                      <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Data</th>
                      <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Ação</th>
                      <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Entidade</th>
                      <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Responsável</th>
                      <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Alterações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-surface">
                    {filteredEntries.map((entry) => (
                      <tr key={entry.id} className="align-top transition-colors hover:bg-surface-hover">
                        <td className="whitespace-nowrap px-5 py-4 text-sm text-text-secondary">
                          {new Date(entry.created_at).toLocaleString('pt-BR')}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4">
                          <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                            {ACTION_LABELS[entry.action] ?? entry.action}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm">
                          <p className="font-medium text-text-primary">{ENTITY_LABELS[entry.entity_type] ?? entry.entity_type}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-text-muted">{entry.entity_id.slice(0, 12)}</p>
                        </td>
                        <td className="px-5 py-4 text-sm text-text-secondary">{entry.actor_label ?? 'Sistema'}</td>
                        <td className="max-w-md px-5 py-4 text-xs text-text-secondary">
                          <ChangeSummary entry={entry} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ChangeSummary({ entry }: { entry: ChangeHistoryEntry }) {
  const changes = Object.entries(entry.detail.changes ?? {});
  if (changes.length) {
    return (
      <ul className="space-y-1">
        {changes.slice(0, 3).map(([field, value]) => (
          <li key={field}>
            <span className="font-medium text-text-primary">{field}</span>: {formatValue(value.from)} → {formatValue(value.to)}
          </li>
        ))}
        {changes.length > 3 && <li>+{changes.length - 3} campo(s)</li>}
      </ul>
    );
  }
  if (entry.detail.snapshot) return 'Registro inicial armazenado';
  return entry.justification ?? 'Evento registrado';
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
