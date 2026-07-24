import { useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import type { Project, StudyStatus } from '@/types/domain';
import { useUpdateProject } from './useProjects';

interface EditProjectDialogProps {
  project: Project;
  children?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function EditProjectDialog({
  project,
  children,
  open: controlledOpen,
  onOpenChange,
}: EditProjectDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [status, setStatus] = useState<StudyStatus>(project.status ?? 'draft');
  const updateProject = useUpdateProject();
  const open = controlledOpen ?? internalOpen;

  const setOpen = (nextOpen: boolean) => {
    if (nextOpen) {
      setName(project.name);
      setDescription(project.description ?? '');
      setStatus(project.status ?? 'draft');
      updateProject.reset();
    }
    if (controlledOpen === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    updateProject.mutate(
      { id: project.id, name: name.trim(), description: description.trim(), status },
      { onSuccess: () => setOpen(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="bg-surface border-border text-text-primary">
        <DialogHeader>
          <DialogTitle className="text-text-primary">Editar projeto</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor={`project-name-${project.id}`}>
              Nome do projeto
            </label>
            <input
              id={`project-name-${project.id}`}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full px-3 py-2 bg-surface text-text-primary border border-border rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor={`project-status-${project.id}`}>
              Status
            </label>
            <select
              id={`project-status-${project.id}`}
              value={status}
              onChange={(event) => setStatus(event.target.value as StudyStatus)}
              className="w-full px-3 py-2 bg-surface text-text-primary border border-border rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="draft">Rascunho</option>
              <option value="active">Ativo</option>
              <option value="completed">Concluído</option>
              <option value="archived">Arquivado</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor={`project-description-${project.id}`}>
              Descrição
            </label>
            <textarea
              id={`project-description-${project.id}`}
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full px-3 py-2 bg-surface text-text-primary border border-border rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          {updateProject.isError && (
            <p className="text-sm text-red-600" role="alert">
              {(updateProject.error as Error).message}
            </p>
          )}
          <DialogFooter>
            <ActionButton
              variant="ghost"
              onClick={() => setOpen(false)}
              type="button"
              disabled={updateProject.isPending}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              variant="primary"
              type="submit"
              disabled={updateProject.isPending || !name.trim()}
            >
              {updateProject.isPending ? 'Salvando...' : 'Salvar alterações'}
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
