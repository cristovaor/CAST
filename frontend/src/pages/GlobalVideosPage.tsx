import { useTranslation } from 'react-i18next';
import { useLocale } from '@/i18n/useLocale';
import { statusLabel } from '@/lib/formatters';
import { useMemo, useState } from 'react';
import { AlertCircle, UploadCloud, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ListFilterBar } from '@/components/data-display/ListFilterBar';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { UploadAssetDialog } from '@/features/acquisition/UploadAssetDialog';
import { useStudies } from '@/features/studies/useStudies';
import { useGlobalVideos } from '@/features/videos/useVideos';

export function GlobalVideosPage() {
  const { t } = useTranslation('videos');
  const locale = useLocale();
  const navigate = useNavigate();
  const { data: videos, isLoading, isError } = useGlobalVideos();
  const { data: studies = [] } = useStudies();
  const [search, setSearch] = useState('');
  const [studyId, setStudyId] = useState('');
  const [status, setStatus] = useState('');

  const studyNames = useMemo(
    () => new Map(studies.map((study) => [study.id, study.name])),
    [studies],
  );
  const statuses = useMemo(
    () => [...new Set((videos ?? []).map((video) => video.status).filter(Boolean))].sort(),
    [videos],
  );
  const filteredVideos = useMemo(() => {
    const term = search.trim().toLocaleLowerCase(locale);
    return (videos ?? []).filter((video) => {
      const matchesSearch = !term || [
        video.id,
        video.filename,
        video.participant_id,
        video.session_id,
        studyNames.get(video.study_id),
      ].some((value) => value?.toLocaleLowerCase(locale).includes(term));
      return matchesSearch && (!studyId || video.study_id === studyId) && (!status || video.status === status);
    });
  }, [locale, search, status, studyId, studyNames, videos]);

  return (
    <div className="min-h-full">
      <PageHeader
        title={t('library.title')}
        description={t('library.description')}
        actions={
          <UploadAssetDialog kind="video">
            <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">
              <UploadCloud size={16} aria-hidden="true" />
              {t('library.upload')}
            </button>
          </UploadAssetDialog>
        }
      />

      <div className="space-y-4 p-6">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div role="status" aria-label={t('library.loading')} className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        ) : isError ? (
          <EmptyState
            variant="error"
            title={t('library.loadFailedTitle')}
            description={t('library.loadFailed')}
            icon={<AlertCircle size={40} className="text-red-400" />}
          />
        ) : !videos || videos.length === 0 ? (
          <EmptyState
            variant="empty"
            title={t('library.emptyTitle')}
            description={t('library.emptyDescription')}
            icon={<Video size={40} className="text-text-disabled" />}
          />
        ) : (
          <>
            <ListFilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder={t('library.searchPlaceholder')}
              resultCount={filteredVideos.length}
              totalCount={videos.length}
              resultLabel={t('library.resultSingular')}
              resultLabelPlural={t('library.resultPlural')}
              filters={[
                {
                  id: 'study',
                  label: t('library.filters.study'),
                  value: studyId,
                  onChange: setStudyId,
                  options: [
                    { value: '', label: t('library.filters.allStudies') },
                    ...studies.map((study) => ({ value: study.id, label: study.name })),
                  ],
                },
                {
                  id: 'status',
                  label: t('library.filters.status'),
                  value: status,
                  onChange: setStatus,
                  options: [
                    { value: '', label: t('library.filters.allStatuses') },
                    ...statuses.map((value) => ({ value, label: statusLabel(value) })),
                  ],
                },
              ]}
            />

            {filteredVideos.length === 0 ? (
              <EmptyState
                variant="empty"
                title={t('library.noMatchTitle')}
                description={t('library.noMatchDescription')}
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-muted">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">{t('library.columns.id')}</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">{t('library.columns.file')}</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">{t('library.columns.study')}</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">{t('library.columns.participant')}</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">{t('library.columns.status')}</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">{t('library.columns.date')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-surface">
                    {filteredVideos.map((video) => (
                      <tr
                        key={video.id}
                        tabIndex={0}
                        onClick={() => navigate(`/app/videos/${video.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            navigate(`/app/videos/${video.id}`);
                          }
                        }}
                        className="cursor-pointer transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                      >
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-text-primary">
                          {video.id.substring(0, 8)}...
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                          <div className="flex items-center gap-2">
                            <Video size={16} className="text-text-muted" aria-hidden="true" />
                            {video.filename}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                          {studyNames.get(video.study_id) ?? video.study_id.substring(0, 8)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                          {video.participant_id.substring(0, 8)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                            video.status === 'processed'
                              ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                              : video.status === 'rejected'
                                ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
                          }`}>
                            {statusLabel(video.status)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                          {new Date(video.created_at).toLocaleDateString(locale)}
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
