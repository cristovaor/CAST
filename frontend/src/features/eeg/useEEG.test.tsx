import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api';
import { useEEGAnalysisArtifacts, useEEGAnalysisResult } from './useEEG';

vi.mock('@/lib/api', () => ({ apiClient: { get: vi.fn() }, API_BASE_URL: '' }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('EEG results after processing', () => {
  it('waits for a run to finish before fetching its artifacts and results', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ schema: 'eeg-result-v1', nodes: [] });
    const { result, rerender } = renderHook(({ ready }) => ({
      mdmp: useEEGAnalysisResult('run-id', 'mdmp', ready),
      artifacts: useEEGAnalysisArtifacts('run-id', ready),
    }), { wrapper, initialProps: { ready: false } });

    expect(apiClient.get).not.toHaveBeenCalled();
    rerender({ ready: true });
    await waitFor(() => expect(result.current.mdmp.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith('/eeg/analysis-runs/run-id/results/mdmp');
    expect(apiClient.get).toHaveBeenCalledWith('/eeg/analysis-runs/run-id/artifacts');
  });
});
