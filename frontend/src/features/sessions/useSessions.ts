import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

export interface SessionListItem {
  id: string;
  participant_id: string;
  created_at: string;
  state?: string | null;
  condition?: string | null;
  video_asset_id?: string | null;
  eeg_asset_id?: string | null;
  study_id: string;
}

export function useSessions(studyId?: string) {
  return useQuery({
    queryKey: ['sessions', studyId ?? 'all'],
    // The global endpoint accepts an optional study_id filter (used by the
    // study's Sessions tab). No separate study-scoped route needed.
    queryFn: () =>
      apiClient.get<SessionListItem[]>(`/sessions/${studyId ? `?study_id=${studyId}` : ''}`),
  });
}
