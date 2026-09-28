import type { MicroAction, StatusVariant, QualityLevel, JobStatus, StudyStatus, VideoStatus, ConsentStatus } from '@/types/domain';

// ─── Date / Time ──────────────────────────────────────────────

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
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

  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `há ${minutes} min`;
  if (hours < 24) return `há ${hours}h`;
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;
  return formatDate(dateStr);
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
  return new Intl.NumberFormat('pt-BR').format(value);
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

// ─── Status Labels (Portuguese) ───────────────────────────────

const studyStatusLabels: Record<StudyStatus, string> = {
  draft:     'Rascunho',
  active:    'Ativo',
  completed: 'Concluído',
  archived:  'Arquivado',
};

const jobStatusLabels: Record<JobStatus, string> = {
  queued:    'Na fila',
  running:   'Processando',
  succeeded: 'Concluído',
  failed:    'Falhou',
  canceled:  'Cancelado',
};

const videoStatusLabels: Record<VideoStatus, string> = {
  uploaded:  'Enviado',
  validated: 'Validado',
  rejected:  'Rejeitado',
  processed: 'Processado',
};

const consentStatusLabels: Record<ConsentStatus, string> = {
  pending:  'Pendente',
  accepted: 'Aceito',
  revoked:  'Revogado',
};

export function statusLabel(status: StatusVariant): string {
  if (status in studyStatusLabels) return studyStatusLabels[status as StudyStatus];
  if (status in jobStatusLabels) return jobStatusLabels[status as JobStatus];
  if (status in videoStatusLabels) return videoStatusLabels[status as VideoStatus];
  if (status in consentStatusLabels) return consentStatusLabels[status as ConsentStatus];
  if (status === 'review_required') return 'Revisão necessária';
  return status;
}

// ─── Micro-action Labels ──────────────────────────────────────

const microActionLabels: Record<MicroAction, string> = {
  OLHO_FECHADO:  'Olho Fechado',
  OLHANDO_CANTO: 'Olhando para Canto',
  MEXEU_LABIOS:  'Mexeu Lábios',
  VIROU_ROSTO:   'Virou Rosto',
  MEXEU_SOBRANCELHA: 'Mexeu Sobrancelha',
  NEUTRAL:       'Neutro',
};

export function microActionLabel(action: MicroAction): string {
  return microActionLabels[action] ?? action;
}

export function microActionShortLabel(action: MicroAction): string {
  const map: Record<MicroAction, string> = {
    OLHO_FECHADO:  'OF',
    OLHANDO_CANTO: 'OC',
    MEXEU_LABIOS:  'ML',
    VIROU_ROSTO:   'VR',
    MEXEU_SOBRANCELHA: 'MSO',
    NEUTRAL:       'N',
  };
  return map[action] ?? action;
}

// ─── Quality level labels ─────────────────────────────────────

export function qualityLabel(level: QualityLevel): string {
  const map: Record<QualityLevel, string> = {
    excellent: 'Excelente',
    good:      'Bom',
    warning:   'Atenção',
    poor:      'Fraco',
    rejected:  'Rejeitado',
  };
  return map[level];
}

// ─── ID Shortener ─────────────────────────────────────────────

export function shortId(id: string): string {
  return id.split('-')[0]?.toUpperCase() ?? id.slice(0, 8).toUpperCase();
}
