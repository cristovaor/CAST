import { useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/Dialog';
import { useCreateProject } from './useProjects';
import { ActionButton } from '@/components/ui/ActionButton';

interface CreateProjectDialogProps {
  children?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CreateProjectDialog({
  children,
  open: controlledOpen,
  onOpenChange,
}: CreateProjectDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const createProject = useCreateProject();
  const open = controlledOpen ?? internalOpen;

  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createProject.mutate(
      { name, description },
      {
        onSuccess: () => {
          setOpen(false);
          setName('');
          setDescription('');
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo Projeto</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="name">Nome do Projeto</label>
            <input 
              id="name"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-border bg-surface text-text-primary rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Ex: Carga Cognitiva 2026"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="description">Descrição</label>
            <textarea 
              id="description"
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-border bg-surface text-text-primary rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Descreva os objetivos deste projeto..."
            />
          </div>
          <DialogFooter>
            <ActionButton variant="ghost" onClick={() => setOpen(false)} type="button">
              Cancelar
            </ActionButton>
            <ActionButton
              variant="primary"
              type="submit"
              isLoading={createProject.isPending}
              loadingText="Criando..."
            >
              Criar Projeto
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
