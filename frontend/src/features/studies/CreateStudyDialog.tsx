import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/Dialog';
import { useCreateStudy } from './useStudies';
import { ActionButton } from '@/components/ui/ActionButton';

export function CreateStudyDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const createStudy = useCreateStudy();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createStudy.mutate(
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
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo Estudo</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="name">Nome do Estudo</label>
            <input 
              id="name"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Ex: Fadiga em operadores — neuroergonomia"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="description">Descrição</label>
            <textarea 
              id="description"
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Descreva os objetivos..."
            />
          </div>
          <DialogFooter>
            <ActionButton variant="ghost" onClick={() => setOpen(false)} type="button">
              Cancelar
            </ActionButton>
            <ActionButton variant="primary" type="submit" disabled={createStudy.isPending}>
              {createStudy.isPending ? 'Criando...' : 'Criar Estudo'}
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
