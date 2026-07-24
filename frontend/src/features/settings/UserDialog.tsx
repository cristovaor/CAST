import { useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';
import type { User, UserRole } from '@/types/domain';
import { useCreateOrganizationUser, useUpdateOrganizationUser } from './useSettings';

export function UserDialog({ user, children }: { user?: User; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(user?.role ?? 'researcher');
  const createUser = useCreateOrganizationUser();
  const updateUser = useUpdateOrganizationUser();
  const mutation = user ? updateUser : createUser;

  const reset = () => {
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
    setPassword('');
    setRole(user?.role ?? 'researcher');
    createUser.reset();
    updateUser.reset();
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (user) {
      updateUser.mutate({ id: user.id, name: name.trim(), role }, { onSuccess: () => setOpen(false) });
    } else {
      createUser.mutate(
        { name: name.trim(), email: email.trim().toLowerCase(), password, role },
        { onSuccess: () => setOpen(false) },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) reset(); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? 'Editar usuário' : 'Adicionar usuário'}</DialogTitle>
          <DialogDescription>
            {user
              ? 'Altere o nome ou papel do usuário na organização.'
              : 'Crie um acesso para um novo integrante da organização.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium text-text-primary">
            Nome
            <input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" />
          </label>
          <label className="block text-sm font-medium text-text-primary">
            E-mail
            <input type="email" required disabled={!!user} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 disabled:bg-surface-muted" />
          </label>
          {!user && (
            <label className="block text-sm font-medium text-text-primary">
              Senha temporária
              <input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" />
            </label>
          )}
          <label className="block text-sm font-medium text-text-primary">
            Papel
            <select value={role} onChange={(event) => setRole(event.target.value as UserRole)} className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2">
              <option value="admin">Administrador</option>
              <option value="researcher">Pesquisador</option>
              <option value="annotator">Anotador</option>
              <option value="viewer">Visualizador</option>
            </select>
          </label>
          {mutation.isError && <p role="alert" className="text-sm text-red-600">{(mutation.error as Error).message}</p>}
          <DialogFooter>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-text-secondary hover:bg-surface-muted">Cancelar</button>
            <button disabled={mutation.isPending || !name.trim() || (!user && (!email.trim() || password.length < 8))} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {mutation.isPending ? 'Salvando...' : user ? 'Salvar alterações' : 'Adicionar usuário'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
