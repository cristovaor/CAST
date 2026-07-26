import { useState, type KeyboardEvent } from 'react';
import { HardDrive, History, Pencil, RotateCcw, Save, ShieldCheck, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
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
import type { User } from '@/types/domain';

const SETTING_TABS = [
  { key: 'organization', label: 'Organização' },
  { key: 'users', label: 'Usuários' },
  { key: 'pipeline', label: 'Pipeline' },
] as const;

const DEFAULT_PIPELINE: PipelineSettings = {
  face_detection_threshold: 0.75,
  blink_tolerance_frames: 5,
  enable_head_pose_estimation: true,
};

type SettingTab = (typeof SETTING_TABS)[number]['key'];

export function SettingsPage() {
  const [tab, setTab] = useState<SettingTab>('organization');
  const organization = useOrganizationSettings();
  const users = useOrganizationUsers();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';
  const pipeline = usePipelineSettings();
  const updatePipeline = useUpdatePipelineSettings();
  const [form, setForm] = useState<PipelineSettings | null>(null);
  const pipelineForm = form ?? pipeline.data ?? DEFAULT_PIPELINE;
  const hasPipelineChanges = !!pipeline.data && !samePipelineSettings(pipelineForm, pipeline.data);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + SETTING_TABS.length) % SETTING_TABS.length;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % SETTING_TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = SETTING_TABS.length - 1;
    const nextTab = SETTING_TABS[nextIndex];
    setTab(nextTab.key);
    document.getElementById(`settings-tab-${nextTab.key}`)?.focus();
  };

  return (
    <div className="min-h-full">
      <PageHeader
        title="Administração"
        description="Gerencie a organização, os acessos da equipe e os parâmetros persistidos do pipeline."
        tabs={
          <div className="flex items-center gap-0.5 overflow-x-auto" role="tablist" aria-label="Seções de administração">
            {SETTING_TABS.map((item, index) => (
              <button
                key={item.key}
                id={`settings-tab-${item.key}`}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                aria-controls={`settings-panel-${item.key}`}
                tabIndex={tab === item.key ? 0 : -1}
                onClick={() => setTab(item.key)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={cn(
                  '-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                  tab === item.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-text-muted hover:text-text-primary',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="max-w-4xl p-4 sm:p-6">
        {tab === 'organization' && (
          <section
            id="settings-panel-organization"
            role="tabpanel"
            aria-labelledby="settings-tab-organization"
            className="card space-y-5 p-4 sm:p-5"
          >
            <div>
              <h2 className="font-semibold text-text-primary">Organização</h2>
              <p className="mt-1 text-sm text-text-secondary">Informações do plano e uso atual de armazenamento.</p>
            </div>

            {organization.isLoading ? (
              <LoadingState message="Carregando organização…" />
            ) : organization.isError ? (
              <ErrorState
                title="Não foi possível carregar a organização"
                onRetry={() => { void organization.refetch(); }}
                className="py-8"
              />
            ) : (
              <>
                <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <Field label="Nome" value={organization.data?.name} />
                  <Field label="Plano" value={planLabel(organization.data?.plan)} />
                  <Field label="Armazenamento usado" value={`${organization.data?.used_storage_gb ?? 0} GB`} />
                  <Field label="Limite contratado" value={`${organization.data?.max_storage_gb ?? 0} GB`} />
                </dl>
                <StorageUsage
                  used={organization.data?.used_storage_gb ?? 0}
                  max={organization.data?.max_storage_gb ?? 0}
                />
              </>
            )}
          </section>
        )}

        {tab === 'users' && (
          <section
            id="settings-panel-users"
            role="tabpanel"
            aria-labelledby="settings-tab-users"
            className="card overflow-hidden"
          >
            <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-text-primary">Usuários da organização</h2>
                <p className="mt-1 text-xs text-text-secondary">
                  {isAdmin ? 'Cadastre acessos e gerencie os papéis da equipe.' : 'Consulte a equipe e as permissões atribuídas.'}
                </p>
              </div>
              {isAdmin ? (
                <UserDialog>
                  <button className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-700">
                    <UserPlus size={15} />
                    Adicionar usuário
                  </button>
                </UserDialog>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                  <ShieldCheck size={14} />
                  Acesso somente para consulta
                </span>
              )}
            </div>

            {users.isLoading ? (
              <LoadingState variant="skeleton-table" rows={3} className="p-4" />
            ) : users.isError ? (
              <ErrorState
                title="Não foi possível carregar os usuários"
                onRetry={() => { void users.refetch(); }}
                className="py-8"
              />
            ) : (
              <>
                <div className="divide-y divide-border md:hidden">
                  {(users.data ?? []).map((user) => (
                    <UserCard key={user.id} user={user} isAdmin={isAdmin} />
                  ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-[720px] w-full text-sm">
                    <thead className="bg-surface-muted text-left">
                      <tr>
                        <th className="p-3">Nome</th>
                        <th className="p-3">E-mail</th>
                        <th className="p-3">Papel</th>
                        <th className="p-3">Cadastro</th>
                        <th className="p-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(users.data ?? []).map((user) => (
                        <tr key={user.id}>
                          <td className="p-3 font-medium text-text-primary">{user.name}</td>
                          <td className="p-3 text-text-secondary">{user.email}</td>
                          <td className="p-3 text-text-secondary">{roleLabel(user.role)}</td>
                          <td className="p-3 text-text-secondary">{new Date(user.created_at).toLocaleDateString('pt-BR')}</td>
                          <td className="p-3"><UserActions user={user} isAdmin={isAdmin} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        {tab === 'pipeline' && (
          <section
            id="settings-panel-pipeline"
            role="tabpanel"
            aria-labelledby="settings-tab-pipeline"
          >
            {pipeline.isLoading ? (
              <LoadingState message="Carregando parâmetros…" />
            ) : pipeline.isError ? (
              <ErrorState
                title="Não foi possível carregar os parâmetros"
                onRetry={() => { void pipeline.refetch(); }}
              />
            ) : (
              <form
                className="card space-y-5 p-4 sm:p-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  updatePipeline.mutate(pipelineForm, { onSuccess: () => setForm(null) });
                }}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-semibold text-text-primary">Parâmetros do pipeline</h2>
                    <p className="mt-1 text-sm text-text-secondary">
                      Preferências armazenadas no nível da organização. Resultados já gerados não são modificados automaticamente.
                    </p>
                  </div>
                  {hasPipelineChanges && (
                    <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                      Alterações não salvas
                    </span>
                  )}
                </div>

                <label className="block text-sm font-medium text-text-primary">
                  Limiar de detecção facial
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={pipelineForm.face_detection_threshold}
                    aria-describedby="face-threshold-help"
                    onChange={(event) => setForm({ ...pipelineForm, face_detection_threshold: Number(event.target.value) })}
                    className="mt-1.5 block h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-text-primary"
                  />
                  <span id="face-threshold-help" className="mt-1 block text-xs font-normal text-text-muted">
                    Faixa de 0 a 1. Valores maiores reduzem falsos positivos, mas podem perder faces difíceis. Padrão: 0,75.
                  </span>
                </label>

                <label className="block text-sm font-medium text-text-primary">
                  Tolerância de piscada
                  <div className="relative mt-1.5">
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={pipelineForm.blink_tolerance_frames}
                      aria-describedby="blink-tolerance-help"
                      onChange={(event) => setForm({ ...pipelineForm, blink_tolerance_frames: Number(event.target.value) })}
                      className="block h-11 w-full rounded-lg border border-border-strong bg-surface px-3 pr-20 text-text-primary"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">frames</span>
                  </div>
                  <span id="blink-tolerance-help" className="mt-1 block text-xs font-normal text-text-muted">
                    Faixa de 1 a 120 frames. Controla quantos frames podem compor um evento de piscada. Padrão: 5.
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-muted p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={pipelineForm.enable_head_pose_estimation}
                    onChange={(event) => setForm({ ...pipelineForm, enable_head_pose_estimation: event.target.checked })}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    <span className="block font-medium text-text-primary">Estimar pose da cabeça</span>
                    <span className="mt-0.5 block text-xs text-text-muted">Habilita a geração de orientação e rotação da cabeça quando o pipeline aplicável processar o vídeo.</span>
                  </span>
                </label>

                {updatePipeline.isError && (
                  <p role="alert" className="rounded-lg border border-danger-border bg-danger-light p-3 text-sm text-red-700">
                    {(updatePipeline.error as Error).message}
                  </p>
                )}
                {updatePipeline.isSuccess && !hasPipelineChanges && (
                  <p role="status" className="text-sm font-medium text-emerald-600">Configurações salvas com sucesso.</p>
                )}

                <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
                  <button
                    type="button"
                    onClick={() => setForm(DEFAULT_PIPELINE)}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-text-secondary hover:bg-surface-muted"
                  >
                    <RotateCcw size={15} />
                    Restaurar padrões
                  </button>
                  <button
                    disabled={updatePipeline.isPending || !hasPipelineChanges || !isAdmin}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    title={!isAdmin ? 'Somente administradores podem alterar o pipeline' : undefined}
                  >
                    <Save size={15} />
                    {updatePipeline.isPending ? 'Salvando…' : 'Salvar alterações'}
                  </button>
                </div>
              </form>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function StorageUsage({ used, max }: { used: number; max: number }) {
  const percent = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div className="rounded-lg border border-border bg-surface-muted p-4">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="inline-flex items-center gap-2 font-medium text-text-primary">
          <HardDrive size={16} /> Uso de armazenamento
        </span>
        <span className="text-text-secondary">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs text-text-muted">{used} GB utilizados de {max} GB contratados.</p>
    </div>
  );
}

function UserCard({ user, isAdmin }: { user: User; isAdmin: boolean }) {
  return (
    <article className="space-y-3 p-4">
      <div>
        <p className="font-medium text-text-primary">{user.name}</p>
        <p className="mt-0.5 break-all text-sm text-text-secondary">{user.email}</p>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-text-muted">
        <span className="rounded-full bg-surface-muted px-2 py-1 font-medium text-text-secondary">{roleLabel(user.role)}</span>
        <span>Desde {new Date(user.created_at).toLocaleDateString('pt-BR')}</span>
      </div>
      <div className="border-t border-border pt-3">
        <UserActions user={user} isAdmin={isAdmin} labeled />
      </div>
    </article>
  );
}

function UserActions({ user, isAdmin, labeled = false }: { user: User; isAdmin: boolean; labeled?: boolean }) {
  const className = labeled
    ? 'inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-text-secondary hover:bg-surface-muted'
    : 'inline-flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary transition hover:bg-surface-muted hover:text-text-primary';

  return (
    <div className={`flex items-center gap-1 ${labeled ? 'flex-wrap' : 'justify-end'}`}>
      {isAdmin && (
        <UserDialog user={user}>
          <button type="button" aria-label={`Editar ${user.name}`} title="Editar usuário" className={className}>
            <Pencil size={15} />
            {labeled && 'Editar'}
          </button>
        </UserDialog>
      )}
      <EntityHistoryDialog entityType="user" entityId={user.id} title={`Histórico de ${user.name}`}>
        <button type="button" aria-label={`Ver histórico de ${user.name}`} title="Ver histórico" className={className}>
          <History size={15} />
          {labeled && 'Histórico'}
        </button>
      </EntityHistoryDialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-text-muted">{label}</dt>
      <dd className="mt-1 font-medium text-text-primary">{value ?? '—'}</dd>
    </div>
  );
}

function samePipelineSettings(a: PipelineSettings, b: PipelineSettings) {
  return a.face_detection_threshold === b.face_detection_threshold
    && a.blink_tolerance_frames === b.blink_tolerance_frames
    && a.enable_head_pose_estimation === b.enable_head_pose_estimation;
}

function planLabel(plan?: string) {
  return {
    standard: 'Padrão',
    professional: 'Profissional',
    enterprise: 'Empresarial',
  }[plan ?? ''] ?? plan ?? '—';
}

function roleLabel(role: string) {
  return {
    admin: 'Administrador',
    researcher: 'Pesquisador',
    annotator: 'Anotador',
    viewer: 'Visualizador',
  }[role] ?? role;
}
