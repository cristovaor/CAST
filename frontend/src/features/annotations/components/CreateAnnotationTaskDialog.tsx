import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import { useGlobalVideos } from '@/features/videos/useVideos';
import { useAnnotationAssignees, useCreateAnnotationTask } from '../api/useAnnotations';

const INITIAL_FORM = { video_id: '', assignee_id: '' };

export function CreateAnnotationTaskDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const { data: videos, isLoading: isLoadingVideos, isError: videosError } = useGlobalVideos();
  const { data: users, isLoading: isLoadingUsers, isError: usersError } = useAnnotationAssignees();
  const createTask = useCreateAnnotationTask();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    createTask.mutate(form, {
      onSuccess: () => {
        setOpen(false);
        setForm(INITIAL_FORM);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova tarefa de anotação</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="annotation-video" className="text-xs font-medium text-text-secondary">
              Vídeo
            </label>
            <select
              id="annotation-video"
              required
              value={form.video_id}
              onChange={(event) => setForm((current) => ({ ...current, video_id: event.target.value }))}
              disabled={isLoadingVideos}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Selecione um vídeo…</option>
              {videos?.map((video) => (
                <option key={video.id} value={video.id}>
                  {video.filename} · {video.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="annotation-assignee" className="text-xs font-medium text-text-secondary">
              Anotador responsável
            </label>
            <select
              id="annotation-assignee"
              required
              value={form.assignee_id}
              onChange={(event) => setForm((current) => ({ ...current, assignee_id: event.target.value }))}
              disabled={isLoadingUsers}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Selecione um usuário…</option>
              {users?.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} · {user.role}
                </option>
              ))}
            </select>
          </div>

          {(videosError || usersError) && (
            <p role="alert" className="text-xs text-red-600">
              Não foi possível carregar {videosError && usersError ? 'vídeos e usuários' : videosError ? 'os vídeos' : 'os usuários'}.
            </p>
          )}
          {createTask.isError && (
            <p role="alert" className="text-xs text-red-600">
              Não foi possível criar a tarefa: {(createTask.error as Error).message}
            </p>
          )}

          <DialogFooter>
            <ActionButton type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </ActionButton>
            <ActionButton
              type="submit"
              variant="primary"
              disabled={createTask.isPending || !form.video_id || !form.assignee_id}
            >
              {createTask.isPending ? 'Criando…' : 'Criar tarefa'}
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
