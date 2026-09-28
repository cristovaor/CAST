import { useState, type ReactNode } from 'react';
import {
  AlertCircle,
  Ban,
  ChevronLeft,
  ChevronRight,
  Download,
  Gauge,
  KeyRound,
  Lock,
  ServerCrash,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useMe } from '@/features/auth/useAuth';
import { useOrganizationUsers } from '@/features/settings/useSettings';
import { useAuditLogs, type ChangeHistoryEntry } from '@/features/audit/useAudit';
import {
  type AuditLogFilters,
  type RequestLogEntry,
  type RequestLogFilters,
  useAuditLogPage,
  useAuditSummary,
  useRequestLogPage,
} from '@/features/audit/useAuditLogs';
import { translate } from '@/i18n/labels';
import { formatDateTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;
const TABS = ['trail', 'requests', 'consents'] as const;
type Tab = (typeof TABS)[number];

const ACTIONS = [
  'create',
  'update',
  'delete',
  'access',
  'export',
  'consent_change',
  'grant',
  'sync_decision',
  'dataset_freeze',
  'login',
  'login_failed',
] as const;
const ENTITY_TYPES = [
  'project',
  'study',
  'participant',
  'session',
  'video',
  'dataset',
  'user',
  'organization',
  'pipeline_settings',
] as const;
const STATUS_CLASSES = ['success', 'client_error', 'server_error', 'denied', 'rate_limited'] as const;
const METHODS = ['POST', 'PUT', 'PATCH', 'DELETE', 'GET'] as const;

const inputClass =
  'h-9 rounded-md border border-border bg-surface px-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-blue-500';

function dayStart(day: string) {
  return day ? `${day}T00:00:00` : undefined;
}
function dayEnd(day: string) {
  return day ? `${day}T23:59:59` : undefined;
}

export function LogsAuditPage() {
  const { t } = useTranslation('audit');
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';
  const [tab, setTab] = useState<Tab>('trail');

  if (me.isLoading) {
    return (
      <div className="flex justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <PageHeader
        title={t('title')}
        description={t('description')}
        tabs={
          isAdmin ? (
            <div role="tablist" aria-label={t('title')} className="flex gap-1">
              {TABS.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={cn(
                    'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                    tab === key
                      ? 'border-blue-600 text-blue-700 dark:text-blue-300'
                      : 'border-transparent text-text-secondary hover:text-text-primary',
                  )}
                >
                  {t(`tabs.${key}`)}
                </button>
              ))}
            </div>
          ) : undefined
        }
      />
      <div className="space-y-4 p-4 sm:p-6">
        {!isAdmin ? (
          <EmptyState
            variant="empty"
            title={t('adminOnly.title')}
            description={t('adminOnly.description')}
            icon={<Lock size={40} className="text-text-disabled" />}
          />
        ) : (
          <>
            <SummaryTiles />
            {tab === 'trail' && <AuditTrailTab />}
            {tab === 'requests' && <RequestsTab />}
            {tab === 'consents' && <ConsentsTab />}
          </>
        )}
      </div>
    </div>
  );
}

function SummaryTiles() {
  const { t } = useTranslation('audit');
  const [windowHours, setWindowHours] = useState(24);
  const summary = useAuditSummary(windowHours);
  const data = summary.data;
  const tiles: { key: string; value?: number; icon: ReactNode; alert?: boolean }[] = [
    { key: 'auditEvents', value: data?.audit_events, icon: <ShieldCheck size={16} /> },
    { key: 'deletions', value: data?.deletions, icon: <Trash2 size={16} />, alert: !!data?.deletions },
    { key: 'failedLogins', value: data?.failed_logins, icon: <KeyRound size={16} />, alert: !!data?.failed_logins },
    { key: 'denied', value: data?.denied, icon: <Ban size={16} />, alert: !!data?.denied },
    { key: 'rateLimited', value: data?.rate_limited, icon: <Gauge size={16} />, alert: !!data?.rate_limited },
    { key: 'serverErrors', value: data?.server_errors, icon: <ServerCrash size={16} />, alert: !!data?.server_errors },
  ];

  return (
    <section aria-label={t('summary.title')} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary">{t('summary.title')}</h2>
        <select
          aria-label={t('summary.window')}
          value={windowHours}
          onChange={(event) => setWindowHours(Number(event.target.value))}
          className={inputClass}
        >
          {[24, 24 * 7, 24 * 30].map((hours) => (
            <option key={hours} value={hours}>
              {translate(`audit:summary.windows.${hours}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <div key={tile.key} className="rounded-lg border border-border bg-surface p-3">
            <p className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className={tile.alert ? 'text-red-600 dark:text-red-400' : 'text-text-muted'}>{tile.icon}</span>
              {translate(`audit:summary.${tile.key}`)}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">
              {summary.isLoading ? '—' : (tile.value ?? 0)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActorSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation('audit');
  const users = useOrganizationUsers();
  return (
    <select aria-label={t('filters.actor')} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
      <option value="">{t('filters.allActors')}</option>
      {(users.data ?? []).map((user) => (
        <option key={user.id} value={user.id}>
          {user.name} ({user.email})
        </option>
      ))}
    </select>
  );
}

function DateRange({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
}) {
  const { t } = useTranslation('audit');
  return (
    <>
      <input type="date" aria-label={t('filters.from')} value={from} onChange={(e) => onFrom(e.target.value)} className={inputClass} />
      <input type="date" aria-label={t('filters.to')} value={to} onChange={(e) => onTo(e.target.value)} className={inputClass} />
    </>
  );
}

function Pager({ skip, total, onSkip }: { skip: number; total: number; onSkip: (skip: number) => void }) {
  const { t } = useTranslation('audit');
  if (total <= PAGE_SIZE) return <p className="text-xs text-text-muted">{t('pager.count', { count: total })}</p>;
  return (
    <div className="flex items-center justify-between gap-2 text-sm text-text-secondary">
      <span>{t('pager.range', { from: skip + 1, to: Math.min(skip + PAGE_SIZE, total), total })}</span>
      <div className="flex gap-1">
        <button
          type="button"
          aria-label={t('pager.previous')}
          disabled={skip === 0}
          onClick={() => onSkip(Math.max(0, skip - PAGE_SIZE))}
          className="rounded-md border border-border p-1.5 hover:bg-surface-hover disabled:opacity-40"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          aria-label={t('pager.next')}
          disabled={skip + PAGE_SIZE >= total}
          onClick={() => onSkip(skip + PAGE_SIZE)}
          className="rounded-md border border-border p-1.5 hover:bg-surface-hover disabled:opacity-40"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function LoadState({ isLoading, isError }: { isLoading: boolean; isError: boolean }) {
  const { t } = useTranslation('audit');
  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }
  if (isError) {
    return (
      <EmptyState
        variant="error"
        title={t('states.errorTitle')}
        description={t('states.errorDescription')}
        icon={<AlertCircle size={40} className="text-red-400" />}
      />
    );
  }
  return null;
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, header: string[], rows: unknown[][]) {
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function AuditTrailTab() {
  const { t } = useTranslation('audit');
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [skip, setSkip] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filters: AuditLogFilters = {
    q: q.trim() || undefined,
    action: action || undefined,
    entity_type: entityType || undefined,
    actor_id: actorId || undefined,
    date_from: dayStart(from),
    date_to: dayEnd(to),
    skip,
    limit: PAGE_SIZE,
  };
  const page = useAuditLogPage(filters);
  const reset = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setSkip(0);
  };
  const items = page.data?.items ?? [];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => reset(setQ)(e.target.value)}
          placeholder={t('filters.searchTrail')}
          aria-label={t('filters.searchTrail')}
          className={cn(inputClass, 'min-w-[14rem] flex-1')}
        />
        <select aria-label={t('filters.action')} value={action} onChange={(e) => reset(setAction)(e.target.value)} className={inputClass}>
          <option value="">{t('filters.allActions')}</option>
          {ACTIONS.map((value) => (
            <option key={value} value={value}>{t(`actions.${value}`)}</option>
          ))}
        </select>
        <select aria-label={t('filters.entity')} value={entityType} onChange={(e) => reset(setEntityType)(e.target.value)} className={inputClass}>
          <option value="">{t('filters.allEntities')}</option>
          {ENTITY_TYPES.map((value) => (
            <option key={value} value={value}>{t(`entities.${value}`)}</option>
          ))}
        </select>
        <ActorSelect value={actorId} onChange={reset(setActorId)} />
        <DateRange from={from} to={to} onFrom={reset(setFrom)} onTo={reset(setTo)} />
        <button
          type="button"
          disabled={!items.length}
          onClick={() =>
            downloadCsv(
              `auditoria-${new Date().toISOString().slice(0, 10)}.csv`,
              [t('columns.date'), t('columns.action'), t('columns.entity'), 'ID', t('columns.actor'), t('columns.justification'), t('columns.detail')],
              items.map((entry) => [
                entry.created_at,
                translate(`audit:actions.${entry.action}`, { defaultValue: entry.action }),
                translate(`audit:entities.${entry.entity_type}`, { defaultValue: entry.entity_type }),
                entry.entity_id,
                entry.actor_label ?? '',
                entry.justification ?? '',
                JSON.stringify(entry.detail),
              ]),
            )
          }
          className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm text-text-secondary hover:bg-surface-hover disabled:opacity-40"
        >
          <Download size={14} /> {t('exportPage')}
        </button>
      </div>

      <LoadState isLoading={page.isLoading} isError={page.isError} />
      {page.data && items.length === 0 && (
        <EmptyState variant="empty" title={t('states.emptyTitle')} description={t('states.emptyTrail')} />
      )}
      {items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('columns.date')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('columns.action')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('columns.entity')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('columns.actor')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('columns.detail')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((entry) => (
                <TrailRow
                  key={entry.id}
                  entry={entry}
                  expanded={expanded === entry.id}
                  onToggle={() => setExpanded(expanded === entry.id ? null : entry.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {page.data && <Pager skip={skip} total={page.data.total} onSkip={setSkip} />}
    </section>
  );
}

const ACTION_TONE: Record<string, string> = {
  delete: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  login_failed: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  create: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
};

function TrailRow({ entry, expanded, onToggle }: { entry: ChangeHistoryEntry; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation('audit');
  const snapshot = entry.detail.snapshot as Record<string, unknown> | undefined;
  const label = typeof snapshot?.label === 'string' ? snapshot.label : undefined;
  return (
    <>
      <tr className="align-top hover:bg-surface-hover">
        <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{formatDateTime(entry.created_at)}</td>
        <td className="whitespace-nowrap px-4 py-3">
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', ACTION_TONE[entry.action] ?? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300')}>
            {translate(`audit:actions.${entry.action}`, { defaultValue: entry.action })}
          </span>
        </td>
        <td className="px-4 py-3">
          <p className="font-medium text-text-primary">
            {translate(`audit:entities.${entry.entity_type}`, { defaultValue: entry.entity_type })}
            {label && <span className="font-normal text-text-secondary"> · {label}</span>}
          </p>
          <p className="font-mono text-[11px] text-text-muted">{entry.entity_id.slice(0, 12)}</p>
        </td>
        <td className="px-4 py-3 text-text-secondary">{entry.actor_label ?? t('system')}</td>
        <td className="max-w-md px-4 py-3 text-xs text-text-secondary">
          {entry.justification && (
            <p className="mb-1 text-text-primary">
              <span className="font-medium">{t('columns.justification')}:</span> {entry.justification}
            </p>
          )}
          <button type="button" onClick={onToggle} aria-expanded={expanded} className="text-blue-700 hover:underline dark:text-blue-300">
            {expanded ? t('hideDetail') : t('showDetail')}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-surface-muted/40">
          <td colSpan={5} className="px-4 py-3">
            <ChangeDetail entry={entry} />
          </td>
        </tr>
      )}
    </>
  );
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function ChangeDetail({ entry }: { entry: ChangeHistoryEntry }) {
  const { t } = useTranslation('audit');
  const changes = Object.entries(entry.detail.changes ?? {});
  if (changes.length) {
    return (
      <table className="text-xs">
        <thead className="text-left text-text-muted">
          <tr>
            <th className="pr-6 font-medium">{t('change.field')}</th>
            <th className="pr-6 font-medium">{t('change.from')}</th>
            <th className="font-medium">{t('change.to')}</th>
          </tr>
        </thead>
        <tbody>
          {changes.map(([field, value]) => (
            <tr key={field}>
              <td className="pr-6 font-medium text-text-primary">{field}</td>
              <td className="pr-6 text-text-secondary">{formatValue(value.from)}</td>
              <td className="text-text-primary">{formatValue(value.to)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-surface p-2 font-mono text-[11px] text-text-secondary">
      {JSON.stringify(entry.detail, null, 2)}
    </pre>
  );
}

function statusTone(code: number) {
  if (code === 429) return 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300';
  if (code >= 500) return 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300';
  if (code >= 400) return 'bg-orange-50 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300';
  return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300';
}

function RequestsTab() {
  const { t } = useTranslation('audit');
  const [q, setQ] = useState('');
  const [method, setMethod] = useState('');
  const [statusClass, setStatusClass] = useState<RequestLogFilters['status_class']>('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [skip, setSkip] = useState(0);
  const page = useRequestLogPage({
    q: q.trim() || undefined,
    method: method || undefined,
    status_class: statusClass,
    actor_id: actorId || undefined,
    date_from: dayStart(from),
    date_to: dayEnd(to),
    skip,
    limit: PAGE_SIZE,
  });
  const reset = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setSkip(0);
  };
  const items: RequestLogEntry[] = page.data?.items ?? [];

  return (
    <section className="space-y-3">
      <p className="text-xs text-text-muted">{t('requests.scope')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => reset(setQ)(e.target.value)}
          placeholder={t('filters.searchRequests')}
          aria-label={t('filters.searchRequests')}
          className={cn(inputClass, 'min-w-[14rem] flex-1')}
        />
        <select aria-label={t('filters.method')} value={method} onChange={(e) => reset(setMethod)(e.target.value)} className={inputClass}>
          <option value="">{t('filters.allMethods')}</option>
          {METHODS.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <select
          aria-label={t('filters.status')}
          value={statusClass}
          onChange={(e) => reset(setStatusClass)(e.target.value as RequestLogFilters['status_class'])}
          className={inputClass}
        >
          <option value="">{t('filters.allStatuses')}</option>
          {STATUS_CLASSES.map((value) => (
            <option key={value} value={value}>{t(`statusClasses.${value}`)}</option>
          ))}
        </select>
        <ActorSelect value={actorId} onChange={reset(setActorId)} />
        <DateRange from={from} to={to} onFrom={reset(setFrom)} onTo={reset(setTo)} />
      </div>

      <LoadState isLoading={page.isLoading} isError={page.isError} />
      {page.data && items.length === 0 && (
        <EmptyState variant="empty" title={t('states.emptyTitle')} description={t('states.emptyRequests')} />
      )}
      {items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('columns.date')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('columns.request')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('columns.status')}</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">{t('columns.duration')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('columns.actor')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('columns.ip')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-surface-hover">
                  <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">{formatDateTime(row.created_at)}</td>
                  <td className="px-4 py-2.5">
                    <span className="mr-2 font-mono text-xs font-semibold text-text-primary">{row.method}</span>
                    <span className="break-all font-mono text-xs text-text-secondary" title={row.route ?? undefined}>
                      {row.path}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', statusTone(row.status_code))}>
                      {row.status_code}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-text-secondary">{row.duration_ms} ms</td>
                  <td className="px-4 py-2.5 text-text-secondary">{row.actor_label ?? t('anonymous')}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-text-muted">{row.ip_address ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {page.data && <Pager skip={skip} total={page.data.total} onSkip={setSkip} />}
    </section>
  );
}

function ConsentsTab() {
  const { t } = useTranslation('audit');
  const consents = useAuditLogs(0, 200);
  const items = consents.data ?? [];
  return (
    <section className="space-y-3">
      <LoadState isLoading={consents.isLoading} isError={consents.isError} />
      {consents.data && items.length === 0 && (
        <EmptyState variant="empty" title={t('states.emptyTitle')} description={t('states.emptyConsents')} />
      )}
      {items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('consents.participant')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('consents.version')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('consents.accepted')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('consents.revoked')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('columns.ip')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-2.5 font-medium text-text-primary">{row.participant_code}</td>
                  <td className="px-4 py-2.5 text-text-secondary">{row.version}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">{row.accepted_at ? formatDateTime(row.accepted_at) : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">{row.revoked_at ? formatDateTime(row.revoked_at) : '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-text-muted">{row.ip_address ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
