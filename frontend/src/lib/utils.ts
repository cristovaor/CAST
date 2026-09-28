import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { QualityLevel, StatusVariant, MicroAction } from '@/types/domain';

// ─── Tailwind class merge helper ──────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Status → Tailwind color classes ─────────────────────────
export function getStatusClasses(status: StatusVariant): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  const map: Record<StatusVariant, { bg: string; text: string; border: string; dot: string }> = {
    draft:            { bg: 'bg-slate-100',   text: 'text-slate-600',  border: 'border-slate-200', dot: 'bg-slate-400'  },
    active:           { bg: 'bg-blue-50',     text: 'text-blue-700',   border: 'border-blue-200',  dot: 'bg-blue-500'   },
    completed:        { bg: 'bg-emerald-50',  text: 'text-emerald-700',border: 'border-emerald-200',dot: 'bg-emerald-500'},
    archived:         { bg: 'bg-slate-100',   text: 'text-slate-500',  border: 'border-slate-200', dot: 'bg-slate-400'  },
    queued:           { bg: 'bg-amber-50',    text: 'text-amber-700',  border: 'border-amber-200', dot: 'bg-amber-500'  },
    running:          { bg: 'bg-blue-50',     text: 'text-blue-700',   border: 'border-blue-200',  dot: 'bg-blue-500'   },
    succeeded:        { bg: 'bg-emerald-50',  text: 'text-emerald-700',border: 'border-emerald-200',dot: 'bg-emerald-500'},
    failed:           { bg: 'bg-red-50',      text: 'text-red-700',    border: 'border-red-200',   dot: 'bg-red-500'    },
    canceled:         { bg: 'bg-slate-100',   text: 'text-slate-500',  border: 'border-slate-200', dot: 'bg-slate-400'  },
    uploaded:         { bg: 'bg-slate-100',   text: 'text-slate-600',  border: 'border-slate-200', dot: 'bg-slate-400'  },
    validated:        { bg: 'bg-blue-50',     text: 'text-blue-700',   border: 'border-blue-200',  dot: 'bg-blue-500'   },
    rejected:         { bg: 'bg-red-50',      text: 'text-red-700',    border: 'border-red-200',   dot: 'bg-red-500'    },
    processed:        { bg: 'bg-emerald-50',  text: 'text-emerald-700',border: 'border-emerald-200',dot: 'bg-emerald-500'},
    pending:          { bg: 'bg-amber-50',    text: 'text-amber-700',  border: 'border-amber-200', dot: 'bg-amber-500'  },
    accepted:         { bg: 'bg-emerald-50',  text: 'text-emerald-700',border: 'border-emerald-200',dot: 'bg-emerald-500'},
    revoked:          { bg: 'bg-red-50',      text: 'text-red-700',    border: 'border-red-200',   dot: 'bg-red-500'    },
    review_required:  { bg: 'bg-orange-50',   text: 'text-orange-700', border: 'border-orange-200',dot: 'bg-orange-500' },
  };
  return map[status] ?? map.draft;
}

// ─── Quality level → classes ──────────────────────────────────
export function getQualityClasses(level: QualityLevel): {
  bg: string;
  text: string;
  border: string;
} {
  const map: Record<QualityLevel, { bg: string; text: string; border: string }> = {
    excellent: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    good:      { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200'    },
    warning:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'   },
    poor:      { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200'  },
    rejected:  { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200'     },
  };
  return map[level];
}

// ─── Quality score → QualityLevel ────────────────────────────
export function scoreToQuality(score: number): QualityLevel {
  if (score >= 0.92) return 'excellent';
  if (score >= 0.80) return 'good';
  if (score >= 0.65) return 'warning';
  if (score >= 0.50) return 'poor';
  return 'rejected';
}

// ─── MicroAction → display config ────────────────────────────
export function getMicroActionConfig(action: MicroAction): {
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  textColor: string;
} {
  const map: Record<MicroAction, { label: string; shortLabel: string; color: string; bgColor: string; textColor: string }> = {
    OLHO_FECHADO:   { label: 'Olho Fechado',       shortLabel: 'OF', color: '#7C3AED', bgColor: 'bg-violet-100', textColor: 'text-violet-700' },
    OLHANDO_CANTO:  { label: 'Olhando para Canto', shortLabel: 'OC', color: '#2563EB', bgColor: 'bg-blue-100',   textColor: 'text-blue-700'   },
    MEXEU_LABIOS:   { label: 'Mexeu Lábios',       shortLabel: 'ML', color: '#059669', bgColor: 'bg-emerald-100',textColor: 'text-emerald-700' },
    VIROU_ROSTO:    { label: 'Virou Rosto',         shortLabel: 'VR', color: '#D97706', bgColor: 'bg-amber-100',  textColor: 'text-amber-700'  },
    MEXEU_SOBRANCELHA: { label: 'Mexeu Sobrancelha', shortLabel: 'MSO', color: '#DB2777', bgColor: 'bg-pink-100', textColor: 'text-pink-700' },
    NEUTRAL:        { label: 'Neutro',              shortLabel: 'N',  color: '#64748B', bgColor: 'bg-slate-100',  textColor: 'text-slate-600'  },
  };
  return map[action] ?? map.NEUTRAL;
}

// ─── Misc helpers ─────────────────────────────────────────────

export function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 9).toUpperCase();
}

export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
