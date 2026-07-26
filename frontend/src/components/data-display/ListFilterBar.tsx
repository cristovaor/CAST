import { RotateCcw, Search } from 'lucide-react';

export interface ListFilterOption {
  value: string;
  label: string;
}

export interface ListFilterSelect {
  id: string;
  label: string;
  value: string;
  options: ListFilterOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

interface ListFilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ListFilterSelect[];
  resultCount: number;
  totalCount: number;
  resultLabel?: string;
  resultLabelPlural?: string;
}

export function ListFilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Buscar...',
  filters = [],
  resultCount,
  totalCount,
  resultLabel = 'resultado',
  resultLabelPlural,
}: ListFilterBarProps) {
  const hasActiveFilters = searchValue.trim() !== '' || filters.some((filter) => filter.value !== '');

  const clearFilters = () => {
    onSearchChange('');
    filters.forEach((filter) => {
      if (!filter.disabled) filter.onChange('');
    });
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-sm">
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center">
        <label className="relative min-w-0 flex-1 2xl:max-w-md">
          <span className="sr-only">Buscar</span>
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-disabled"
          />
          <input
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 w-full rounded-lg border border-border-strong bg-surface pl-9 pr-3 text-sm text-text-primary outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </label>

        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 2xl:flex 2xl:w-auto 2xl:flex-wrap 2xl:items-center">
          {filters.map((filter) => (
            <label key={filter.id} className="flex min-w-0 items-center gap-2">
              <span className="sr-only">{filter.label}</span>
              <select
                aria-label={filter.label}
                value={filter.value}
                disabled={filter.disabled}
                onChange={(event) => filter.onChange(event.target.value)}
                className="h-10 min-w-0 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-text-secondary outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-disabled 2xl:min-w-36 2xl:w-auto"
              >
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-muted hover:text-text-primary"
            >
              <RotateCcw size={14} />
              Limpar
            </button>
          )}
        </div>

        <p className="ml-auto whitespace-nowrap text-right text-xs text-text-muted" role="status">
          {resultCount} {resultCount === 1 ? resultLabel : (resultLabelPlural ?? `${resultLabel}s`)}
          {resultCount !== totalCount ? ` de ${totalCount}` : ''}
        </p>
      </div>
    </div>
  );
}
