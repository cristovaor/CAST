export interface ExplorerTrackDescriptor {
  id: string;
  modality: string;
  label: string;
  kind: string;
  start_time_us: number;
  end_time_us: number;
  samples_url: string;
  provenance_url?: string | null;
  unit?: string | null;
  quality_summary: Record<string, unknown>;
  capabilities: string[];
  experimental: boolean;
}

export interface ExplorerManifest {
  session_id: string;
  start_time_us: number;
  end_time_us: number;
  tracks: ExplorerTrackDescriptor[];
  warnings: string[];
}

export interface ExplorerTrackRegistration {
  descriptor: ExplorerTrackDescriptor;
  queryKey: readonly unknown[];
}

export function registerExplorerTracks(
  manifest: ExplorerManifest,
): ExplorerTrackRegistration[] {
  return manifest.tracks.map((descriptor) => ({
    descriptor,
    queryKey: ['explorer-track', descriptor.id],
  }));
}

