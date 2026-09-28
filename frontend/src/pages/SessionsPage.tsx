import { useTranslation } from 'react-i18next';
import { useLocale } from '@/i18n/useLocale';
import { useMemo, useState } from 'react';
import { Activity, ChevronRight, Plus, User, Video } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ListFilterBar } from '@/components/data-display/ListFilterBar';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { ToneBadge } from '@/components/ui/ToneBadge';
import { useSessions, type SessionListItem } from '@/features/sessions/useSessions';
import { SESSION_STATE_META, type SessionState } from '@/types/research';

export function SessionsPage() {
  const { t } = useTranslation('sessions');
  const locale = useLocale();
  const { studyId } = useParams();
  const { data: sessions, isLoading } = useSessions(studyId);
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [state, setState] = useState('');
  const [modality, setModality] = useState('');

  const filteredSessions = useMemo(() => {
    const term = search.trim().toLocaleLowerCase(locale);
    return (sessions ?? []).filter((session) => {
      const matchesSearch = !term || [
        session.id,
        session.participant_id,
        session.condition,
      ].some((value) => value?.toLocaleLowerCase(locale).includes(term));
      const matchesState = !state || session.state === state;
      const matchesModality =
        !modality ||
        (modality === 'video' && !!session.video_asset_id) ||
        (modality === 'eeg' && !!session.eeg_asset_id) ||
        (modality === 'both' && !!session.video_asset_id && !!session.eeg_asset_id) ||
        (modality === 'none' && !session.video_asset_id && !session.eeg_asset_id);
      return matchesSearch && matchesState && matchesModality;
    });
  }, [locale, modality, search, sessions, state]);

  return (
    <div className="min-h-full">
      <PageHeader
        title={t('list.title')}
        description={t('list.description')}
        actions={
          <button
            onClick={() => navigate('new')}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <Plus size={16} aria-hidden="true" />
            {t('list.newSession')}
          </button>
        }
      />

      <div className="space-y-4 p-6">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div role="status" aria-label={t('list.loading')} className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-blue-600" />
          </div>
        ) : !sessions || sessions.length === 0 ? (
          <EmptyState
            variant="empty"
            title={t('list.emptyTitle')}
            description={t('list.emptyDescription')}
            icon={<Video size={40} className="text-text-disabled" />}
          />
        ) : (
          <>
            <ListFilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder={t('list.searchPlaceholder')}
              resultCount={filteredSessions.length}
              totalCount={sessions.length}
              resultLabel={t('list.resultSingular')}
              resultLabelPlural={t('list.resultPlural')}
              filters={[
                {
                  id: 'state',
                  label: t('list.filters.state'),
                  value: state,
                  onChange: setState,
                  options: [
                    { value: '', label: t('list.filters.allStates') },
                    ...Object.entries(SESSION_STATE_META).map(([value, meta]) => ({
                      value,
                      label: meta.label,
                    })),
                  ],
                },
                {
                  id: 'modality',
                  label: t('list.filters.modality'),
                  value: modality,
                  onChange: setModality,
                  options: [
                    { value: '', label: t('list.filters.allModalities') },
                    { value: 'video', label: t('list.filters.video') },
                    { value: 'eeg', label: t('list.filters.eeg') },
                    { value: 'both', label: t('list.filters.both') },
                    { value: 'none', label: t('list.filters.none') },
                  ],
                },
              ]}
            />

            {filteredSessions.length === 0 ? (
              <EmptyState
                variant="empty"
                title={t('list.noMatchTitle')}
                description={t('list.noMatchDescription')}
              />
            ) : (
              <div className="space-y-2">
                {filteredSessions.map((session) => (
                  <SessionRow key={session.id} session={session} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SessionRow({ session }: { session: SessionListItem }) {
  const { t } = useTranslation('sessions');
  const locale = useLocale();
  const stateMeta = session.state
    ? SESSION_STATE_META[session.state as SessionState]
    : undefined;

  return (
    <Link
      to={`/app/sessions/${session.id}`}
      className="flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-blue-300 dark:hover:border-blue-800"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-text-muted">
        <User size={16} aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary">S-{session.id.slice(0, 8)}</span>
          {session.condition && (
            <span className="text-[11px] text-text-muted">· {session.condition}</span>
          )}
        </div>
        <p className="text-[11px] text-text-muted">
          {new Date(session.created_at).toLocaleString(locale)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <ModalityChip present={!!session.video_asset_id} icon={Video} label={t('list.video')} tone="blue" />
        <ModalityChip present={!!session.eeg_asset_id} icon={Activity} label={t('list.eeg')} tone="cyan" />
      </div>

      {stateMeta && <ToneBadge tone={stateMeta.tone}>{stateMeta.label}</ToneBadge>}
      <ChevronRight size={16} className="shrink-0 text-text-disabled" aria-hidden="true" />
    </Link>
  );
}

function ModalityChip({ present, icon: Icon, label, tone }: {
  present: boolean;
  icon: typeof Video;
  label: string;
  tone: 'blue' | 'cyan';
}) {
  const { t } = useTranslation('sessions');
  const className = present
    ? (tone === 'blue'
      ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300'
      : 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300')
    : 'border-border bg-app-bg text-text-disabled';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium ${className}`}
      title={present ? t('list.attached', { label }) : t('list.missing', { label })}
    >
      <Icon size={11} aria-hidden="true" /> {label}
    </span>
  );
}
