import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

export type DeletableEntity = 'project' | 'study' | 'participant' | 'session' | 'video';

const COLLECTION: Record<DeletableEntity, string> = {
  project: 'projects',
  study: 'studies',
  participant: 'participants',
  session: 'sessions',
  video: 'videos',
};

/** Query keys whose data can hold the deleted entity or its descendants. */
const AFFECTED_QUERIES = [
  'projects',
  'studies',
  'participants',
  'sessions',
  'videos',
  'dashboard',
  'annotations',
  'jobs',
  'audit',
];

export interface DeletionImpact {
  entity_type: DeletableEntity;
  entity_id: string;
  label: string;
  confirmation_phrase: string;
  /** Rows per database table, including the entity itself. */
  counts: Record<string, number>;
  /** "table.column" → rows kept with the reference cleared. */
  detached: Record<string, number>;
  storage_objects: number;
  active_jobs: number;
  can_delete: boolean;
}

export interface DeletionPayload {
  confirmation: string;
  justification: string;
}

export function deletionPath(entityType: DeletableEntity, entityId: string) {
  return `/${COLLECTION[entityType]}/${entityId}`;
}

export function useDeletionImpact(
  entityType: DeletableEntity,
  entityId: string,
  enabled: boolean,
) {
  return useQuery<DeletionImpact>({
    queryKey: ['deletion-impact', entityType, entityId],
    queryFn: () =>
      apiClient.get<DeletionImpact>(`${deletionPath(entityType, entityId)}/deletion-impact`),
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

export function useDeleteEntity(entityType: DeletableEntity, entityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: DeletionPayload) =>
      apiClient.delete<void>(deletionPath(entityType, entityId), { body: payload }),
    onSuccess: () => {
      for (const key of AFFECTED_QUERIES) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
