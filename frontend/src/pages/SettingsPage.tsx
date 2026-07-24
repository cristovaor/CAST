import { useState } from 'react';
import { History, Pencil, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { cn } from '@/lib/utils';
import { EntityHistoryDialog } from '@/features/audit/EntityHistoryDialog';
import { UserDialog } from '@/features/settings/UserDialog';
import { useMe } from '@/features/auth/useAuth';
import {
  useOrganizationSettings,
  useOrganizationUsers,
  usePipelineSettings,
  useUpdatePipelineSettings,
  type PipelineSettings,
} from '@/features/settings/useSettings';

const SETTING_TABS = [
  { key: 'organization', label: 'Organização' },
  { key: 'users', label: 'Usuários' },
  { key: 'pipeline', label: 'Pipeline' },
] as const;

export function SettingsPage() {
  const [tab, setTab] = useState<(typeof SETTING_TABS)[number]['key']>('organization');
  const organization = useOrganizationSettings();
  const users = useOrganizationUsers();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';
  const pipeline = usePipelineSettings();
  const updatePipeline = useUpdatePipelineSettings();
  const [form, setForm] = useState<PipelineSettings | null>(null);
  const pipelineForm = form ?? pipeline.data ?? {
    face_detection_threshold: 0.75,
    blink_tolerance_frames: 5,
    enable_head_pose_estimation: true,
  };

  return (
    <div className="min-h-full">
      <PageHeader
        title="Configurações"
        description="Consulte sua organização, equipe e parâmetros persistidos do pipeline."
        tabs={
          <div className="flex items-center gap-0.5">
            {SETTING_TABS.map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={cn(
                  'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                  tab === item.key ? 'text-blue-600 border-blue-600' : 'text-slate-500 border-transparent hover:text-slate-700',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        }
      />
      <div className="p-6 max-w-3xl">
        {tab === 'organization' && (
          <section className="card p-5 space-y-4">
            <h2 className="font-semibold text-text-primary">Organização</h2>
            {organization.isLoading ? <p>Carregando…</p> : organization.isError ? (
              <p role="alert" className="text-red-600">Não foi possível carregar a organização.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <Field label="Nome" value={organization.data?.name} />
                <Field label="Plano" value={organization.data?.plan} />
                <Field label="Armazenamento usado" value={`${organization.data?.used_storage_gb ?? 0} GB`} />
                <Field label="Limite" value={`${organization.data?.max_storage_gb ?? 0} GB`} />
              </dl>
            )}
          </section>
        )}

        {tab === 'users' && (
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border p-4">
              <div>
                <h2 className="font-semibold text-text-primary">Usuários da organização</h2>
                <p className="text-xs text-text-secondary">Cadastre acessos e gerencie os papéis da equipe.</p>
              </div>
              {isAdmin ? (
                <UserDialog>
                  <button className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
                    <UserPlus size={15} />
                    Adicionar usuário
                  </button>
                </UserDialog>
              ) : (
                <span className="text-xs text-text-muted">Somente administradores podem gerenciar acessos.</span>
              )}
            </div>
            {users.isError && (
              <p role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                Não foi possível carregar os usuários.
              </p>
            )}
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left">
                <tr>
                  <th className="p-3">Nome</th>
                  <th className="p-3">E-mail</th>
                  <th className="p-3">Papel</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(users.data ?? []).map((user) => (
                  <tr key={user.id}>
                    <td className="p-3 font-medium text-text-primary">{user.name}</td>
                    <td className="p-3 text-text-secondary">{user.email}</td>
                    <td className="p-3">{roleLabel(user.role)}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        {isAdmin && (
                          <UserDialog user={user}>
                            <button type="button" title="Editar usuário" className="rounded-lg p-2 text-text-secondary transition hover:bg-blue-50 hover:text-blue-600">
                              <Pencil size={15} />
                            </button>
                          </UserDialog>
                        )}
                        <EntityHistoryDialog entityType="user" entityId={user.id} title={`Histórico de ${user.name}`}>
                          <button type="button" title="Ver histórico" className="rounded-lg p-2 text-text-secondary transition hover:bg-surface-muted hover:text-text-primary">
                            <History size={15} />
                          </button>
                        </EntityHistoryDialog>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'pipeline' && (
          <form
            className="card p-5 space-y-4"
            onSubmit={(event) => { event.preventDefault(); updatePipeline.mutate(pipelineForm); }}
          >
            <h2 className="font-semibold text-text-primary">Parâmetros do pipeline</h2>
            <label className="block text-sm">Limiar de detecção facial
              <input type="number" min="0" max="1" step="0.01" value={pipelineForm.face_detection_threshold} onChange={(e) => setForm({ ...pipelineForm, face_detection_threshold: Number(e.target.value) })} className="mt-1 block w-full rounded-md border border-border px-3 py-2" />
            </label>
            <label className="block text-sm">Tolerância de piscada (frames)
              <input type="number" min="1" max="120" value={pipelineForm.blink_tolerance_frames} onChange={(e) => setForm({ ...pipelineForm, blink_tolerance_frames: Number(e.target.value) })} className="mt-1 block w-full rounded-md border border-border px-3 py-2" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={pipelineForm.enable_head_pose_estimation} onChange={(e) => setForm({ ...pipelineForm, enable_head_pose_estimation: e.target.checked })} />
              Estimar pose da cabeça
            </label>
            {updatePipeline.isError && <p role="alert" className="text-sm text-red-600">{(updatePipeline.error as Error).message}</p>}
            {updatePipeline.isSuccess && <p role="status" className="text-sm text-emerald-600">Configurações salvas.</p>}
            <button disabled={updatePipeline.isPending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {updatePipeline.isPending ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return <div><dt className="text-text-muted">{label}</dt><dd className="mt-1 font-medium text-text-primary">{value ?? '—'}</dd></div>;
}

function roleLabel(role: string) {
  return {
    admin: 'Administrador',
    researcher: 'Pesquisador',
    annotator: 'Anotador',
    viewer: 'Visualizador',
  }[role] ?? role;
}
