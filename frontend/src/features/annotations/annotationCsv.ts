import type { AnnotationEvent } from '@/types/annotation';

const CSV_COLUMNS = [
  'kind',
  'actionCode',
  'actionLabel',
  'startFrame',
  'endFrame',
  'startTime',
  'endTime',
  'source',
  'confidence',
  'notes',
] as const;

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function eventsToCsv(events: AnnotationEvent[]): string {
  const rows = events.map((event) =>
    [
      event.kind,
      event.actionCode,
      event.actionLabel,
      String(event.startFrame),
      String(event.endFrame),
      event.startTime.toFixed(3),
      event.endTime.toFixed(3),
      event.source,
      event.confidence != null ? String(event.confidence) : '',
      event.notes ?? '',
    ]
      .map((field) => escapeCsvField(field))
      .join(','),
  );
  return [CSV_COLUMNS.join(','), ...rows].join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function parseCsvLines(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

export interface ParsedAnnotationRow {
  kind: 'interval' | 'point';
  actionCode: string;
  actionLabel: string;
  startFrame: number;
  endFrame: number;
  notes?: string;
}

export interface AnnotationCsvParseResult {
  rows: ParsedAnnotationRow[];
  errors: string[];
}

export function parseAnnotationCsv(text: string): AnnotationCsvParseResult {
  const lines = parseCsvLines(text.trim());
  if (lines.length === 0) {
    return { rows: [], errors: ['Arquivo CSV vazio.'] };
  }

  const header = lines[0].map((cell) => cell.trim());
  const indexOf = (name: string) => header.indexOf(name);
  const kindIdx = indexOf('kind');
  const actionCodeIdx = indexOf('actionCode');
  const actionLabelIdx = indexOf('actionLabel');
  const startFrameIdx = indexOf('startFrame');
  const endFrameIdx = indexOf('endFrame');
  const notesIdx = indexOf('notes');

  const errors: string[] = [];
  if (actionCodeIdx === -1 || startFrameIdx === -1 || endFrameIdx === -1) {
    errors.push(
      'Cabeçalho inválido: são obrigatórias as colunas actionCode, startFrame e endFrame.',
    );
    return { rows: [], errors };
  }

  const rows: ParsedAnnotationRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    const rowNumber = i + 1;
    const actionCode = line[actionCodeIdx]?.trim();
    const startFrameRaw = line[startFrameIdx]?.trim();
    const endFrameRaw = line[endFrameIdx]?.trim();

    if (!actionCode) {
      errors.push(`Linha ${rowNumber}: actionCode vazio.`);
      continue;
    }
    const startFrame = Number(startFrameRaw);
    const endFrame = Number(endFrameRaw);
    if (!Number.isFinite(startFrame) || !Number.isFinite(endFrame)) {
      errors.push(`Linha ${rowNumber}: startFrame/endFrame inválidos.`);
      continue;
    }
    const kindRaw = kindIdx !== -1 ? line[kindIdx]?.trim() : '';
    const kind: 'interval' | 'point' = kindRaw === 'point' ? 'point' : 'interval';
    if (kind === 'point' && startFrame !== endFrame) {
      errors.push(
        `Linha ${rowNumber}: anotações do tipo "point" exigem startFrame == endFrame.`,
      );
      continue;
    }
    if (kind === 'interval' && endFrame < startFrame) {
      errors.push(`Linha ${rowNumber}: endFrame deve ser >= startFrame.`);
      continue;
    }

    rows.push({
      kind,
      actionCode,
      actionLabel: (actionLabelIdx !== -1 ? line[actionLabelIdx]?.trim() : '') || actionCode,
      startFrame,
      endFrame,
      notes: notesIdx !== -1 ? line[notesIdx]?.trim() || undefined : undefined,
    });
  }

  return { rows, errors };
}
