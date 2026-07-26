import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DatasetsPage } from './DatasetsPage';

vi.mock('@/features/datasets/BuildDatasetDialog', () => ({
  BuildDatasetDialog: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/features/annotations/api/useAnnotationEditor', () => ({
  useLandmarkChunk: () => ({ data: undefined, isLoading: false, isError: false }),
}));

vi.mock('@/features/multimodal/useMultimodal', () => ({
  useDatasets: () => ({
    data: [],
    isLoading: false,
    isError: false,
    isFetching: false,
  }),
  useDatasetRecords: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
  }),
  useFreezeDataset: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/features/sessions/useSessions', () => ({
  useSessions: () => ({
    data: [
      {
        id: '12345678-abcd-4000-8000-123456789abc',
        state: 'ready_to_sync',
        condition: 'baseline',
        video_asset_id: 'video-1',
        eeg_asset_id: 'eeg-1',
        sync_state: 'synced',
      },
      {
        id: '87654321-abcd-4000-8000-123456789abc',
        state: 'awaiting_data',
        condition: 'carga',
        video_asset_id: null,
        eeg_asset_id: null,
        sync_state: null,
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));

describe('DatasetsPage', () => {
  it('shows live scientific readiness even before the first dataset exists', () => {
    render(<DatasetsPage />);

    expect(screen.getByText('Nenhum dataset versionado foi criado')).toBeInTheDocument();
    expect(screen.getByText('Prontidão das sessões')).toBeInTheDocument();
    expect(screen.getByText('12345678')).toBeInTheDocument();
    expect(screen.getByText('Sincronizada')).toBeInTheDocument();
    expect(screen.getByText('50% sincronizadas')).toBeInTheDocument();
    expect(screen.getAllByText('Vídeo + EEG').length).toBeGreaterThan(0);
  });
});
