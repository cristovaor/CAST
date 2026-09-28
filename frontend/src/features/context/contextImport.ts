import i18n from '@/i18n';
export type ImportRow = Record<string, unknown>;

export function parseContextFile(text: string): ImportRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed) || parsed.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new Error('O JSON deve ser um array de objetos.');
    }
    return parsed as ImportRow[];
  }
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  if (lines.every((line) => line.trimStart().startsWith('{'))) {
    return lines.map((line) => JSON.parse(line) as ImportRow);
  }
  const headers = splitCsvLine(lines[0]);
  if (headers.length < 2) throw new Error('CSV precisa de pelo menos duas colunas.');
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = ''; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) { current += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { values.push(current.trim()); current = ''; }
    else current += char;
  }
  values.push(current.trim());
  return values;
}

export function numeric(value: unknown, column: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(i18n.t('acquisition:imports.invalidColumn', { column }));
  return parsed;
}
