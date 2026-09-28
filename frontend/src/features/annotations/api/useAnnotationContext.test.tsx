import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { annotationsApi } from './annotationsApi';
import { useAnnotationContext } from './useAnnotationEditor';

vi.mock('./annotationsApi', () => ({ annotationsApi: { getContext: vi.fn() } }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

it('refreshes a processing artifact without a job entry and stops once it is ready', async () => {
  vi.useFakeTimers();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  vi.mocked(annotationsApi.getContext)
    .mockResolvedValueOnce({ processing: [], landmarkArtifact: { id: 'artifact', status: 'processing' } } as never)
    .mockResolvedValue({ processing: [], landmarkArtifact: { id: 'artifact', status: 'ready' } } as never);
  const { result, unmount } = renderHook(() => useAnnotationContext('video'), { wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(result.current.data?.landmarkArtifact?.status).toBe('processing');
  await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
  expect(result.current.data?.landmarkArtifact?.status).toBe('ready');
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(annotationsApi.getContext).toHaveBeenCalledTimes(2);
  unmount();
  client.clear();
});
