import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api';
import { DeleteEntityDialog } from './DeleteEntityDialog';
import type { DeletionImpact } from './useDeletion';

vi.mock('@/lib/api', () => ({
  apiClient: { get: vi.fn(), delete: vi.fn() },
}));

const impact: DeletionImpact = {
  entity_type: 'project',
  entity_id: 'p-1',
  label: 'Projeto Alfa',
  confirmation_phrase: 'Projeto Alfa',
  counts: { projects: 1, studies: 2, video_assets: 5, sync_runs: 3 },
  detached: {},
  storage_objects: 12,
  active_jobs: 0,
  can_delete: true,
};

function renderDialog(onDeleted = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DeleteEntityDialog entityType="project" entityId="p-1" open onOpenChange={() => {}} onDeleted={onDeleted} />
    </QueryClientProvider>,
  );
  return onDeleted;
}

describe('DeleteEntityDialog', () => {
  // No vitest globals, so Testing Library cannot unmount between tests itself.
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.delete).mockReset();
  });

  it('summarises the cascade before asking for confirmation', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(impact);
    renderDialog();

    expect(await screen.findByText('Estudos')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3 outros registros derivados')).toBeInTheDocument();
    expect(screen.getByText('12 arquivos no armazenamento')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/projects/p-1/deletion-impact');
  });

  it('only deletes after the phrase and a justification are given', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(impact);
    vi.mocked(apiClient.delete).mockResolvedValue(undefined);
    const onDeleted = renderDialog();

    const justification = await screen.findByLabelText('Justificativa');
    const submit = screen.getByRole('button', { name: 'Excluir permanentemente' });
    expect(submit).toBeDisabled();

    fireEvent.change(justification, {
      target: { value: 'Criado por engano na importação' },
    });
    fireEvent.change(screen.getByLabelText(/Para confirmar/), { target: { value: 'Projeto' } });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Para confirmar/), { target: { value: 'Projeto Alfa' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(apiClient.delete).toHaveBeenCalledWith('/projects/p-1', {
      body: { confirmation: 'Projeto Alfa', justification: 'Criado por engano na importação' },
    });
  });

  it('blocks deletion while processing jobs are active', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ ...impact, active_jobs: 2, can_delete: false });
    renderDialog();

    expect(await screen.findByText(/Há 2 processamentos na fila/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Justificativa')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir permanentemente' })).toBeDisabled();
  });
});
