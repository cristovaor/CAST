import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SyncPage } from './SyncPage';

vi.mock('@/features/inference/components/MultimodalPlayer', () => ({
  MultimodalPlayer: () => <div>Player multimodal</div>,
}));

vi.mock('@/features/videos/useVideos', () => ({
  useVideoPlaybackUrl: () => ({ data: undefined }),
  useVideoTimeline: () => ({ data: undefined }),
}));

vi.mock('@/features/multimodal/useMultimodal', () => ({
  __esModule: true,
  useSessionDetail: () => ({ data: { id: 'session-1' } }),
  useSync: () => ({
    data: {
      session_id: 'session-1',
      state: 'not_synced',
      method: null,
      offset_ms: 0,
      drift_ms_per_min: null,
      confidence: null,
      anchors: [],
      history: [],
      approved_run_id: null,
      mapping_version: 'affine-v1',
      quality_grade: null,
      uncertainty_ms: null,
      duration_ms: 90_000,
      capabilities: [
        'absolute_timestamp',
        'hardware_trigger',
        'digital_marker',
        'visual_event',
        'audio_event',
        'reference_frame',
        'manual',
        'event_correlation',
        'informed_offset',
        'semi_automatic',
      ].map((method) => ({
        method,
        status: method === 'event_correlation' ? 'available' : 'requires_inputs',
        missing_inputs: method === 'event_correlation' ? [] : ['entrada específica'],
        description: `Descrição ${method}`,
      })),
      latest_run: null,
      approved_run: null,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSyncEvidence: () => ({ data: [] }),
  useSyncRuns: () => ({ data: [], refetch: vi.fn() }),
  useSyncRun: () => ({ data: undefined, refetch: vi.fn() }),
  useSyncJob: () => ({ data: undefined }),
  useCreateSyncRun: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useUploadSyncEvidence: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useDeleteSyncEvidence: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useCancelSyncJob: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useRetrySyncJob: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useSyncRunDecision: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

describe('SyncPage', () => {
  it('renders ten method cards, real duration and method-specific inputs', () => {
    render(
      <MemoryRouter initialEntries={['/app/sessions/session-1/sync']}>
        <Routes>
          <Route path="/app/sessions/:sessionId/sync" element={<SyncPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Sincronização vídeo & EEG' })).toBeInTheDocument();
    expect(screen.getByText('0:00 — 1:30')).toBeInTheDocument();
    expect(screen.getAllByText('Requer entradas')).toHaveLength(9);
    expect(screen.getByText('Disponível')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Offset informado'));

    expect(screen.getByLabelText('Offset')).toBeInTheDocument();
    expect(screen.getByLabelText('Incerteza (ms)')).toBeInTheDocument();
    expect(screen.getByLabelText('Fonte')).toBeInTheDocument();
    expect(screen.getByLabelText('Justificativa técnica')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar processamento real' })).toBeEnabled();
  });
});
