import { CheckCircle, Clock } from "lucide-react";
import { ToneBadge } from "@/components/ui/ToneBadge";
import { QualityFindings } from "@/components/status/QualityFindings";
import { QUALITY_VERDICT_META, type QualityVerdict, type QualityFinding } from "@/types/research";

export interface VideoQualityReport {
  assessed: boolean;
  verdict: QualityVerdict | null;
  faceDetectionRate: number | null;
  validFrameRatio: number | null;
  fps: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  findings: QualityFinding[];
  criteria: string[];
}

// Video quality panel (docs §9, §20): a verdict with structured findings and
// explicit criteria — never a single opaque score.
export function VideoQualityPanel({ quality }: { quality: VideoQualityReport }) {
  if (!quality.assessed) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-app-bg p-4 text-sm text-text-muted">
        <Clock size={16} className="shrink-0 text-text-muted" />
        Qualidade ainda não avaliada — disponível após o processamento do vídeo.
      </div>
    );
  }

  const meta = QUALITY_VERDICT_META[quality.verdict ?? 'review_required'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h3 className="font-semibold text-lg">Qualidade do vídeo</h3>
          <p className="text-sm text-muted-foreground">Avaliação real derivada do processamento, com critérios explícitos.</p>
        </div>
        <ToneBadge tone={meta.tone}>{meta.label}</ToneBadge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Detecção facial" value={quality.faceDetectionRate != null ? `${(quality.faceDetectionRate * 100).toFixed(1)}%` : '—'} />
        <Stat label="Frames válidos" value={quality.validFrameRatio != null ? `${(quality.validFrameRatio * 100).toFixed(1)}%` : '—'} />
        <Stat label="Resolução" value={quality.width && quality.height ? `${quality.width}×${quality.height}` : '—'} />
        <Stat label="FPS" value={quality.fps != null ? quality.fps.toFixed(1) : '—'} />
      </div>

      {quality.findings.length > 0 ? (
        <QualityFindings findings={quality.findings} />
      ) : (
        <div className="flex items-center gap-2 text-sm text-emerald-600">
          <CheckCircle size={16} /> Nenhum problema de qualidade identificado.
        </div>
      )}

      {quality.criteria.length > 0 && (
        <p className="text-[11px] text-text-muted">Critérios: {quality.criteria.join(' · ')}</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
