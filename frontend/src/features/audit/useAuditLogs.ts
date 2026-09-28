import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { ChangeHistoryEntry } from './useAudit';

export interface Page<T> {
  items: T[];
  total: number;
}

export interface AuditLogFilters {
  action?: string;
  entity_type?: string;
  actor_id?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
  skip: number;
  limit: number;
}

export type RequestStatusClass =
  | 'success'
  | 'client_error'
  | 'server_error'
  | 'denied'
  | 'rate_limited';

export interface RequestLogFilters {
  method?: string;
  status_class?: RequestStatusClass | '';
  actor_id?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
  skip: number;
  limit: number;
}

export interface RequestLogEntry {
  id: string;
  actor_id?: string | null;
  actor_label?: string | null;
  method: string;
  path: string;
  route?: string | null;
  status_code: number;
  duration_ms: number;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

export interface AuditSummary {
  window_hours: number;
  audit_events: number;
  deletions: number;
  failed_logins: number;
  writes: number;
  denied: number;
  rate_limited: number;
  server_errors: number;
}

function toQuery(filters: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function useAuditLogPage(filters: AuditLogFilters, enabled = true) {
  return useQuery<Page<ChangeHistoryEntry>>({
    queryKey: ['audit', 'logs', filters],
    queryFn: () => apiClient.get<Page<ChangeHistoryEntry>>(`/audit/logs?${toQuery(filters)}`),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useRequestLogPage(filters: RequestLogFilters, enabled = true) {
  return useQuery<Page<RequestLogEntry>>({
    queryKey: ['audit', 'requests', filters],
    queryFn: () => apiClient.get<Page<RequestLogEntry>>(`/audit/requests?${toQuery(filters)}`),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAuditSummary(windowHours: number, enabled = true) {
  return useQuery<AuditSummary>({
    queryKey: ['audit', 'summary', windowHours],
    queryFn: () => apiClient.get<AuditSummary>(`/audit/summary?window_hours=${windowHours}`),
    enabled,
  });
}
