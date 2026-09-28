import { useTranslation } from 'react-i18next';
import { useLocale } from '@/i18n/useLocale';
import { useMemo, useState } from 'react';
import { AlertCircle, Database, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ListFilterBar } from '@/components/data-display/ListFilterBar';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { useGlobalAnnotations } from '@/features/annotations/api/useAnnotations';
import { CreateAnnotationTaskDialog } from '@/features/annotations/components/CreateAnnotationTaskDialog';

const TASK_STATUSES = ['pending', 'in_progress', 'submitted', 'reviewed'] as const;

export function GlobalAnnotationsPage() {
  const { t } = useTranslation('annotations');
  const locale = useLocale();
  const navigate = useNavigate();
  const { data: tasks, isLoading, isError } = useGlobalAnnotations();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [assignee, setAssignee] = useState('');

  const assignees = useMemo(
    () => [...new Set((tasks ?? []).map((task) => task.assignee_name).filter(Boolean))].sort(),
    [tasks],
  );
  const filteredTasks = useMemo(() => {
    const term = search.trim().toLocaleLowerCase(locale);
    return (tasks ?? []).filter((task) => {
      const matchesSearch = !term || [
        task.id,
        task.video_id,
        task.assignee_name,
      ].some((value) => value.toLocaleLowerCase(locale).includes(term));
      return matchesSearch && (!status || task.status === status) && (!assignee || task.assignee_name === assignee);
    });
  }, [assignee, locale, search, status, tasks]);

  return (
    <div className="min-h-full">
      <PageHeader
        title={t('tasks.title')}
        description={t('tasks.description')}
        actions={
          <CreateAnnotationTaskDialog>
            <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">
              <Plus size={16} aria-hidden="true" />
              {t('tasks.newTask')}
            </button>
          </CreateAnnotationTaskDialog>
        }
      />

      <div className="space-y-4 p-6">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div role="status" aria-label={t('tasks.loading')} className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        ) : isError ? (
          <EmptyState
            variant="error"
            title={t('tasks.loadFailedTitle')}
            description={t('tasks.loadFailed')}
            icon={<AlertCircle size={40} className="text-red-400" />}
          />
        ) : !tasks || tasks.length === 0 ? (
          <EmptyState
            variant="empty"
            title={t('tasks.emptyTitle')}
            description={t('tasks.emptyDescription')}
            icon={<Database size={40} className="text-text-disabled" />}
          />
        ) : (
          <>
            <ListFilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder={t('tasks.searchPlaceholder')}
              resultCount={filteredTasks.length}
              totalCount={tasks.length}
              resultLabel={t('tasks.resultSingular')}
              resultLabelPlural={t('tasks.resultPlural')}
              filters={[
                {
                  id: 'status',
                  label: t('tasks.filterStatus'),
                  value: status,
                  onChange: setStatus,
                  options: [
                    { value: '', label: t('tasks.allStatuses') },
                    ...TASK_STATUSES.map((value) => ({ value, label: t(`tasks.status.${value}`) })),
                  ],
                },
                {
                  id: 'assignee',
                  label: t('tasks.filterAssignee'),
                  value: assignee,
                  onChange: setAssignee,
                  options: [
                    { value: '', label: t('tasks.allAssignees') },
                    ...assignees.map((value) => ({ value, label: value })),
                  ],
                },
              ]}
            />

            {filteredTasks.length === 0 ? (
              <EmptyState
                variant="empty"
                title={t('tasks.noMatchTitle')}
                description={t('tasks.noMatchDescription')}
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-muted">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">{t('tasks.columns.id')}</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">{t('tasks.columns.video')}</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">{t('tasks.columns.assignee')}</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">{t('tasks.columns.status')}</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">{t('tasks.columns.createdAt')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-surface">
                    {filteredTasks.map((task) => (
                      <tr
                        key={task.id}
                        tabIndex={0}
                        onClick={() => navigate(`/app/videos/${task.video_id}/annotations?taskId=${task.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            navigate(`/app/videos/${task.video_id}/annotations?taskId=${task.id}`);
                          }
                        }}
                        className="cursor-pointer transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                      >
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-text-primary">
                          {task.id.substring(0, 8)}...
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                          {task.video_id.substring(0, 8)}...
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                          {task.assignee_name}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                            task.status === 'reviewed'
                              ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                              : task.status === 'in_progress'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                : task.status === 'submitted'
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
                          }`}>
                            {t(`tasks.status.${task.status as 'pending'}`, { defaultValue: task.status })}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                          {task.created_at ? new Date(task.created_at).toLocaleDateString(locale) : '—'}
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
