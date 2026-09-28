import type { MicroAction, StatusVariant, QualityLevel } from '@/types/domain';
import i18n, { currentLanguage } from '@/i18n';
import { translate } from '@/i18n/labels';

// ─── Date / Time ──────────────────────────────────────────────
// Every formatter reads the active UI language at call time. Components that
// render these without a `t()` of their own call `useLocale()` so they
// re-render on a language switch.

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(currentLanguage(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(currentLanguage(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return i18n.t('domain:relativeTime.justNow');
  if (days >= 7) return formatDate(dateStr);

  const rtf = new Intl.RelativeTimeFormat(currentLanguage(), { numeric: 'auto', style: 'short' });
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  if (hours < 24) return rtf.format(-hours, 'hour');
  return rtf.format(-days, 'day');
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

// ─── Numbers ──────────────────────────────────────────────────

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(currentLanguage()).format(value);
}

export function formatPercentage(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatResolution(width: number, height: number): string {
  return `${width}×${height}`;
}

export function formatFPS(fps: number): string {
  return `${Math.round(fps)} fps`;
}

// ─── Enum labels (see the `domain` locale namespace) ─────────

export function statusLabel(status: StatusVariant | (string & {})): string {
  const key = `domain:status.${status}`;
  return i18n.exists(key) ? translate(key) : status;
}

/** Translated user role; unknown roles read as the least-privileged one. */
export function roleLabel(role?: string): string {
  const key = `domain:role.${role ?? 'viewer'}`;
  return translate(i18n.exists(key) ? key : 'domain:role.viewer');
}

// ─── Micro-action Labels ──────────────────────────────────────

export function microActionLabel(action: MicroAction): string {
  const key = `domain:microAction.${action}`;
  return i18n.exists(key) ? translate(key) : action;
}

export function microActionShortLabel(action: MicroAction): string {
  const key = `domain:microActionShort.${action}`;
  return i18n.exists(key) ? translate(key) : action;
}

// ─── Quality level labels ─────────────────────────────────────

export function qualityLabel(level: QualityLevel): string {
  return i18n.t(`domain:quality.${level}`);
}

// ─── ID Shortener ─────────────────────────────────────────────

export function shortId(id: string): string {
  return id.split('-')[0]?.toUpperCase() ?? id.slice(0, 8).toUpperCase();
}
