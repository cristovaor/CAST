import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

export interface ConsentAuditLog {
  id: string;
  accepted_at: string;
  revoked_at?: string | null;
  participant_code: string;
  version: string;
  ip_address?: string | null;
}

export function useAuditLogs(skip: number = 0, limit: number = 100) {
  return useQuery<ConsentAuditLog[]>({
    queryKey: ['audit', 'consents', skip, limit],
    queryFn: () => apiClient.get<ConsentAuditLog[]>(`/audit/consents?skip=${skip}&limit=${limit}`),
  });
}

export interface ChangeHistoryEntry {
  id: string;
  action: 'create' | 'update' | 'access' | 'export' | 'consent_change' | 'grant' | 'delete' | string;
  actor_id?: string | null;
  actor_label?: string | null;
  entity_type: string;
  entity_id: string;
  justification?: string | null;
  detail: {
    changes?: Record<string, { from: unknown; to: unknown }>;
    snapshot?: Record<string, unknown>;
    [key: string]: unknown;
  };
  created_at: string;
}

export function useChangeHistory(entityType?: string, entityId?: string, limit: number = 100) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (entityType) params.set('entity_type', entityType);
  if (entityId) params.set('entity_id', entityId);

  return useQuery<ChangeHistoryEntry[]>({
    queryKey: ['audit', 'history', entityType ?? 'all', entityId ?? 'all', limit],
    queryFn: () => apiClient.get<ChangeHistoryEntry[]>(`/audit/history?${params.toString()}`),
    enabled: entityId ? !!entityType : true,
  });
}
