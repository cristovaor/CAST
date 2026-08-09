export interface PupilObservationInput {
  source_time_us: number;
  source_clock_id: string;
  canonical_time_us: number | null;
  uncertainty_us: number;
  pupil_diameter_px: number | null;
  iris_diameter_px: number | null;
  luminance: number | null;
  reference_ratio: number | null;
  quality_flags: string[];
  valid: boolean;
}

export function parsePupilObservations(text: string): PupilObservationInput[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  let rows: Record<string, unknown>[];
  if (trimmed.startsWith('[')) rows = JSON.parse(trimmed) as Record<string, unknown>[];
  else if (trimmed.split(/\r?\n/)[0].trimStart().startsWith('{')) rows = trimmed.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
  else {
    const lines = trimmed.split(/\r?\n/).filter(Boolean); const headers = lines[0].split(',').map((item) => item.trim());
    rows = lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, line.split(',')[index]?.trim() ?? ''])));
  }
  const numberOrNull = (value: unknown) => value === '' || value == null ? null : Number(value);
  return rows.map((row, index) => {
    const sourceTime = Number(row.source_time_us); const pupil = numberOrNull(row.pupil_diameter_px); const iris = numberOrNull(row.iris_diameter_px);
    if (!Number.isFinite(sourceTime) || (pupil != null && !Number.isFinite(pupil)) || (iris != null && !Number.isFinite(iris))) throw new Error(`Linha ${index + 1} contém medida inválida.`);
    return {
      source_time_us: Math.round(sourceTime), source_clock_id: String(row.source_clock_id || 'video-pts'),
      canonical_time_us: numberOrNull(row.canonical_time_us), uncertainty_us: Number(row.uncertainty_us || 0),
      pupil_diameter_px: pupil, iris_diameter_px: iris, luminance: numberOrNull(row.luminance), reference_ratio: numberOrNull(row.reference_ratio),
      quality_flags: Array.isArray(row.quality_flags) ? row.quality_flags.map(String) : String(row.quality_flags || '').split('|').filter(Boolean),
      valid: row.valid == null ? true : !['false','0','no'].includes(String(row.valid).toLowerCase()),
    };
  }).sort((left, right) => left.source_time_us - right.source_time_us);
}
