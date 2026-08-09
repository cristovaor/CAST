import { describe, expect, it } from 'vitest';
import { compareManifests } from './sessionComparison';
import type { ExplorerManifest } from './types';

const manifest = (session_id: string, modalities: string[]): ExplorerManifest => ({
  session_id,
  start_time_us: 0,
  end_time_us: 10,
  warnings: [],
  tracks: modalities.map((modality, index) => ({
    id: `${modality}:${index}`,
    modality,
    label: modality,
    kind: 'line',
    start_time_us: 0,
    end_time_us: 10,
    samples_url: '/samples',
    quality_summary: {},
    capabilities: [],
    experimental: false,
  })),
});
describe('session comparison', () => {
  it('reports common and asymmetric modalities', () => expect(compareManifests(manifest('a',['video','eeg']), manifest('b',['video','gaze']))).toEqual({ common: ['video'], onlyLeft: ['eeg'], onlyRight: ['gaze'], compatible: true }));
});
