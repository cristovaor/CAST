import { describe, expect, it } from 'vitest';
import { registerExplorerTracks, type ExplorerManifest } from './types';

describe('registerExplorerTracks', () => {
  it('registers descriptors without copying sample series into global state', () => {
    const manifest: ExplorerManifest = {
      session_id: 'session-1',
      start_time_us: 0,
      end_time_us: 1_000_000,
      warnings: [],
      tracks: [{
        id: 'eeg:run-1',
        modality: 'eeg',
        label: 'EEG',
        kind: 'line',
        start_time_us: 0,
        end_time_us: 1_000_000,
        samples_url: '/eeg/timeseries',
        quality_summary: {},
        capabilities: ['range-query'],
        experimental: false,
      }],
    };

    expect(registerExplorerTracks(manifest)).toEqual([{
      descriptor: manifest.tracks[0],
      queryKey: ['explorer-track', 'eeg:run-1'],
    }]);
  });
});
