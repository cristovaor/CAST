import { Link, useParams } from 'react-router-dom';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import { EXPERIMENTAL_DESIGNS, MODALITIES } from '@/types/research';
import { AlertTriangle, CheckCircle2, Database, LineChart, Video, Waypoints, Activity } from 'lucide-react';
import {
  useStudy,
  useStudyQualitySummary,
  type ModalityQualitySummary,
} from '@/features/studies/useStudies';
import { useSessions } from '@/features/sessions/useSessions';

// Study-scoped sections rendered inside StudyLayout's contextual nav (docs §6).
// Each surfaces the study's REAL persisted config (no hardcoded values), with a
// graceful hint when a field wasn't configured.

const DESIGN_LABEL = Object.fromEntries(EXPERIMENTAL_DESIGNS.map((d) => [d.value, d.label]));
const MODALITY_LABEL = Object.fromEntries(MODALITIES.map((m) => [m.value, m.label]));

function SectionShell({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function NotConfigured({ what }: { what: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-[13px] text-slate-500">
      {what} não foi configurado para este estudo. Defina no{' '}
      <Link to="/app/studies/new" className="text-blue-600 hover:text-blue-700">assistente de estudo</Link>.
    </div>
  );
}

export function StudyProtocolPage() {
  const { studyId } = useParams();
  const { data: study } = useStudy(studyId ?? '');
  const cfg = study?.config;

  return (
    <SectionShell title="Protocolo" subtitle="Definição operacional do estudo: desenho, modalidades e grupos.">
      {cfg?.design || cfg?.modalities?.length ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 text-[13px]">
          <Row k="Desenho" v={cfg?.design ? DESIGN_LABEL[cfg.design] ?? cfg.design : '—'} />
          <Row k="Modalidades" v={(cfg?.modalities ?? []).map((m) => MODALITY_LABEL[m] ?? m).join(' + ') || '—'} />
          {cfg?.groups && <Row k="Grupos / condições" v={cfg.groups} />}
          {cfg?.program && <Row k="Programa" v={cfg.program} />}
        </div>
      ) : (
        <NotConfigured what="O protocolo" />
      )}
    </SectionShell>
  );
}

export function StudyHypothesesPage() {
  const { studyId } = useParams();
  const { data: study } = useStudy(studyId ?? '');
  const hypotheses = study?.config?.hypotheses ?? [];

  return (
    <SectionShell title="Hipóteses" subtitle="Hipóteses são opcionais e podem ser exploratórias.">
      {hypotheses.length > 0 ? (
        <>
          <div className="space-y-2">
            {hypotheses.map((h) => (
              <div key={h.code} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-semibold text-blue-600">{h.code}</span>
                </div>
                <p className="text-[13px] text-slate-700">{h.statement}</p>
              </div>
            ))}
          </div>
          <ScientificCaveat variant="association" compact />
        </>
      ) : (
        <NotConfigured what="Nenhuma hipótese" />
      )}
    </SectionShell>
  );
}

export function StudyConditionsPage() {
  const { studyId } = useParams();
  const { data: study } = useStudy(studyId ?? '');
  const groups = study?.config?.groups;

  return (
    <SectionShell title="Condições experimentais" subtitle="Grupos, condições, estímulos e tarefas.">
      {groups ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[13px] text-slate-700 whitespace-pre-line">{groups}</p>
        </div>
      ) : (
        <NotConfigured what="As condições experimentais" />
      )}
    </SectionShell>
  );
}

export function StudyQualityPage() {
  const { studyId } = useParams();
  const {
    data: quality,
    isLoading,
    isError,
  } = useStudyQualitySummary(studyId ?? '');

  return (
    <SectionShell title="Qualidade" subtitle="Vídeo e EEG avaliados de forma independente.">
      {isLoading && (
        <div className="flex justify-center py-10">
          <div
            className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600"
            role="status"
            aria-label="Carregando qualidade"
          />
        </div>
      )}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar o resumo de qualidade deste estudo.
        </div>
      )}
      {quality && (
        <>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            {quality.sessions_count} {quality.sessions_count === 1 ? 'sessão vinculada' : 'sessões vinculadas'} ao estudo.
            As médias abaixo consideram somente ativos com métricas persistidas.
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <QualitySummaryCard
              title="Vídeo"
              icon={Video}
              summary={quality.video}
              metricLabel="frames válidos"
              secondaryMetricLabel="detecção facial"
            />
            <QualitySummaryCard
              title="EEG"
              icon={Activity}
              summary={quality.eeg}
              metricLabel="registro válido"
            />
          </div>
          {quality.video.total_assets === 0 && quality.eeg.total_assets === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-[13px] text-slate-500">
              Ainda não há ativos de vídeo ou EEG vinculados às sessões deste estudo.
            </div>
          )}
        </>
      )}
      <ScientificCaveat variant="quality" compact />
    </SectionShell>
  );
}

function QualitySummaryCard({
  title,
  icon: Icon,
  summary,
  metricLabel,
  secondaryMetricLabel,
}: {
  title: string;
  icon: typeof Video;
  summary: ModalityQualitySummary;
  metricLabel: string;
  secondaryMetricLabel?: string;
}) {
  const approved = (summary.verdicts.approved ?? 0)
    + (summary.verdicts.approved_with_caveats ?? 0);
  const needsAttention = (summary.verdicts.review_required ?? 0)
    + (summary.verdicts.rejected ?? 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Icon size={16} className="text-slate-400" />
          {title}
        </p>
        <span className="text-[11px] text-slate-400">
          {summary.assessed_assets} de {summary.total_assets} avaliados
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
        {formatQualityRatio(summary.average_valid_ratio)}
      </p>
      <p className="text-[11px] text-slate-400">{metricLabel} (média dos ativos medidos)</p>
      {secondaryMetricLabel && (
        <p className="mt-2 text-xs text-slate-500">
          {secondaryMetricLabel}: <span className="font-semibold text-slate-700">{formatQualityRatio(summary.average_face_detection_rate)}</span>
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-[11px]">
        <span className="inline-flex items-center gap-1 text-emerald-700">
          <CheckCircle2 size={13} /> {approved} aprovados
        </span>
        <span className="inline-flex items-center gap-1 text-amber-700">
          <AlertTriangle size={13} /> {needsAttention} requerem atenção
        </span>
        <span className="text-slate-500">{summary.findings_count} achados</span>
      </div>
    </div>
  );
}

function formatQualityRatio(value: number | null) {
  return value == null
    ? '—'
    : `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

export function StudyDatasetsPage() {
  return (
    <SectionShell title="Datasets do estudo" subtitle="Versões reprodutíveis geradas a partir das sessões.">
      <Link to="/app/datasets" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-blue-300">
        <Database size={16} className="text-slate-400" />
        <span className="text-sm font-medium text-slate-700">Abrir gestão de datasets</span>
      </Link>
    </SectionShell>
  );
}

export function StudyAnalysisPage() {
  const { studyId } = useParams();
  const { data: sessions = [], isLoading } = useSessions(studyId);
  const firstSession = sessions[0];

  return (
    <SectionShell title="Análises do estudo" subtitle="Workspace sincronizado e análises configuráveis.">
      <div className="flex flex-wrap gap-3">
        <Link
          to={firstSession ? `/app/sessions/${firstSession.id}/analysis` : `/app/studies/${studyId}/sessions`}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 hover:border-blue-300"
        >
          <LineChart size={16} className="text-text-muted" />
          <span className="text-sm font-medium text-text-primary">
            {isLoading ? 'Carregando sessões…' : firstSession ? 'Workspace sincronizado' : 'Adicionar uma sessão'}
          </span>
        </Link>
        <Link to={`/app/studies/${studyId}/sync`} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 hover:border-blue-300">
          <Waypoints size={16} className="text-text-muted" /><span className="text-sm font-medium text-text-primary">Sincronização</span>
        </Link>
      </div>
    </SectionShell>
  );
}

export function StudySettingsPage() {
  return (
    <SectionShell title="Configurações do estudo" subtitle="Governança, retenção e responsáveis.">
      <ScientificCaveat variant="privacy" />
    </SectionShell>
  );
}

function Row({ k, v }: { k: string; v?: string }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-2">
      <span className="text-slate-400">{k}</span>
      <span className="text-slate-700 font-medium">{v ?? '—'}</span>
    </div>
  );
}
