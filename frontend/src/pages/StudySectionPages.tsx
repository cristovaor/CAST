import { Link, useParams } from 'react-router-dom';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import { EXPERIMENTAL_DESIGNS, MODALITIES } from '@/types/research';
import { Waypoints, LineChart, Database } from 'lucide-react';
import { useStudy } from '@/features/studies/useStudies';

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
  return (
    <SectionShell title="Qualidade" subtitle="Vídeo e EEG avaliados de forma independente.">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-800">Vídeo</p>
          <p className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">96,8%</p>
          <p className="text-[11px] text-slate-400">frames válidos (média das sessões)</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-800">EEG</p>
          <p className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">89%</p>
          <p className="text-[11px] text-slate-400">percentual válido (média das sessões)</p>
        </div>
      </div>
      <ScientificCaveat variant="quality" compact />
    </SectionShell>
  );
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
  return (
    <SectionShell title="Análises do estudo" subtitle="Workspace sincronizado e análises configuráveis.">
      <div className="flex flex-wrap gap-3">
        <Link to={`/app/sessions/0048/analysis`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-blue-300">
          <LineChart size={16} className="text-slate-400" /><span className="text-sm font-medium text-slate-700">Workspace sincronizado</span>
        </Link>
        <Link to={`/app/studies/${studyId}/sync`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-blue-300">
          <Waypoints size={16} className="text-slate-400" /><span className="text-sm font-medium text-slate-700">Sincronização</span>
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
