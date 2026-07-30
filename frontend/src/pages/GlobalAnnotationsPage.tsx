import { useMemo, useState } from 'react';
import { AlertCircle, Database, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ListFilterBar } from '@/components/data-display/ListFilterBar';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { useGlobalAnnotations } from '@/features/annotations/api/useAnnotations';
import { CreateAnnotationTaskDialog } from '@/features/annotations/components/CreateAnnotationTaskDialog';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  submitted: 'Enviada',
  reviewed: 'Revisada',
};

export function GlobalAnnotationsPage() {
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
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return (tasks ?? []).filter((task) => {
      const matchesSearch = !term || [
        task.id,
        task.video_id,
        task.assignee_name,
      ].some((value) => value.toLocaleLowerCase('pt-BR').includes(term));
      return matchesSearch && (!status || task.status === status) && (!assignee || task.assignee_name === assignee);
    });
  }, [assignee, search, status, tasks]);

  return (
    <div className="min-h-full">
      <PageHeader
        title="Tarefas de Anotação"
        description="Gerencie as tarefas de revisão manual e anotação dos vídeos."
        actions={
          <CreateAnnotationTaskDialog>
            <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">
              <Plus size={16} />
              Nova tarefa
            </button>
          </CreateAnnotationTaskDialog>
        }
      />

      <div className="space-y-4 p-6">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        ) : isError ? (
          <EmptyState
            variant="error"
            title="Erro ao carregar"
            description="Não foi possível carregar as tarefas de anotação."
            icon={<AlertCircle size={40} className="text-red-400" />}
          />
        ) : !tasks || tasks.length === 0 ? (
          <EmptyState
            variant="empty"
            title="Nenhuma tarefa cadastrada"
            description="Crie tarefas de anotação para vincular revisores a vídeos específicos."
            icon={<Database size={40} className="text-text-disabled" />}
          />
        ) : (
          <>
            <ListFilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Buscar por tarefa, vídeo ou anotador..."
              resultCount={filteredTasks.length}
              totalCount={tasks.length}
              resultLabel="tarefa"
              resultLabelPlural="tarefas"
              filters={[
                {
                  id: 'status',
                  label: 'Filtrar por status',
                  value: status,
                  onChange: setStatus,
                  options: [
                    { value: '', label: 'Todos os status' },
                    ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
                  ],
                },
                {
                  id: 'assignee',
                  label: 'Filtrar por anotador',
                  value: assignee,
                  onChange: setAssignee,
                  options: [
                    { value: '', label: 'Todos os anotadores' },
                    ...assignees.map((value) => ({ value, label: value })),
                  ],
                },
              ]}
            />

            {filteredTasks.length === 0 ? (
              <EmptyState
                variant="empty"
                title="Nenhuma tarefa corresponde aos filtros"
                description="Ajuste a busca ou limpe os filtros para ver outras tarefas."
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-muted">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">ID da tarefa</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Vídeo asset</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Anotador responsável</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Status</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Data de criação</th>
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
                              ? 'bg-green-100 text-green-800'
                              : task.status === 'in_progress'
                                ? 'bg-blue-100 text-blue-800'
                                : task.status === 'submitted'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {STATUS_LABELS[task.status]}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                          {task.created_at ? new Date(task.created_at).toLocaleDateString('pt-BR') : '—'}
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
