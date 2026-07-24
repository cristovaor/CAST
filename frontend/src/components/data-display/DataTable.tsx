import { type ReactNode, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  ChevronUp, ChevronDown, MoreHorizontal,
  ChevronLeft, ChevronRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (value: unknown, row: T) => ReactNode;
}

export interface DataTableProps<T extends { id: string }> {
  columns: ColumnDef<T>[];
  data: T[];
  isLoading?: boolean;
  emptyState?: ReactNode;
  rowActions?: (row: T) => { label: string; icon?: ReactNode; onClick: () => void; destructive?: boolean }[];
  pageSize?: number;
  className?: string;
  onRowClick?: (row: T) => void;
}

// ─── DataTable ────────────────────────────────────────────────

export function DataTable<T extends { id: string }>({
  columns,
  data,
  isLoading,
  emptyState,
  rowActions,
  pageSize = 10,
  className,
  onRowClick,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);

  // Sort
  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const av = (a as Record<string, unknown>)[sortKey];
        const bv = (b as Record<string, unknown>)[sortKey];
        const cmp = String(av ?? '').localeCompare(String(bv ?? ''), 'pt-BR');
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : data;

  // Paginate
  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  }

  if (isLoading) {
    return <DataTableSkeleton columns={columns} rows={pageSize > 5 ? 5 : pageSize} className={className} />;
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="data-table w-full" aria-label="Tabela de dados">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={cn(
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                    col.sortable && 'cursor-pointer select-none hover:bg-slate-100',
                  )}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  aria-sort={
                    sortKey === col.key
                      ? sortDir === 'asc' ? 'ascending' : 'descending'
                      : undefined
                  }
                >
                  <div className={cn('flex items-center gap-1', col.align === 'right' && 'justify-end', col.align === 'center' && 'justify-center')}>
                    {col.header}
                    {col.sortable && sortKey === col.key && (
                      sortDir === 'asc'
                        ? <ChevronUp size={11} className="text-blue-500" />
                        : <ChevronDown size={11} className="text-blue-500" />
                    )}
                  </div>
                </th>
              ))}
              {rowActions && <th className="w-10" />}
            </tr>
          </thead>

          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (rowActions ? 1 : 0)} className="py-12 text-center">
                  {emptyState ?? (
                    <span className="text-sm text-slate-400">Nenhum resultado encontrado</span>
                  )}
                </td>
              </tr>
            ) : (
              paged.map((row) => (
                <tr
                  key={row.id}
                  className={cn(onRowClick && 'cursor-pointer')}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => {
                    const val = (row as Record<string, unknown>)[col.key];
                    return (
                      <td
                        key={col.key}
                        className={cn(
                          col.align === 'right' && 'text-right',
                          col.align === 'center' && 'text-center',
                        )}
                      >
                        {col.render ? col.render(val, row) : String(val ?? '—')}
                      </td>
                    );
                  })}

                  {/* Row actions */}
                  {rowActions && (
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <RowActionsMenu
                        rowId={row.id}
                        actions={rowActions(row)}
                        open={openActionsId === row.id}
                        onToggle={() => setOpenActionsId((id) => id === row.id ? null : row.id)}
                        onClose={() => setOpenActionsId(null)}
                      />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
          <span className="text-xs text-slate-400">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sorted.length)} de {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              aria-label="Página anterior"
              className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft size={14} className="text-slate-500" />
            </button>
            <span className="text-xs font-medium text-slate-600 px-2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              aria-label="Próxima página"
              className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              <ChevronRight size={14} className="text-slate-500" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Row actions menu ─────────────────────────────────────────

function RowActionsMenu({
  rowId,
  actions,
  open,
  onToggle,
  onClose,
}: {
  rowId: string;
  actions: { label: string; icon?: ReactNode; onClick: () => void; destructive?: boolean }[];
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  return (
    <div className="relative inline-block">
      <button
        onClick={onToggle}
        aria-label={`Ações para linha ${rowId}`}
        aria-expanded={open}
        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <MoreHorizontal size={15} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={onClose} />
          <div className={cn(
            'absolute right-0 z-20 w-44 py-1',
            'bg-white rounded-xl border border-slate-200 shadow-dropdown',
            'animate-scale-in',
          )}>
            {actions.map((action, i) => (
              <button
                key={i}
                onClick={() => { action.onClick(); onClose(); }}
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors text-left',
                  action.destructive
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-slate-700 hover:bg-slate-50',
                )}
              >
                {action.icon && <span className="shrink-0">{action.icon}</span>}
                {action.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────

function DataTableSkeleton<T>({
  columns,
  rows,
  className,
}: {
  columns: ColumnDef<T>[];
  rows: number;
  className?: string;
}) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="data-table w-full">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td key={col.key}>
                  <div className={cn('skeleton h-4 rounded', col.width ? 'w-full' : 'w-24')} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
