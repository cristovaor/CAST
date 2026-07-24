import { Link } from 'react-router-dom';
import { Clock, Video, Activity, Layers, Sigma } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import { ProvenanceLegend } from '@/components/data-display/ProvenanceLegend';

// Analyses index (docs §13). Not a fixed dashboard — the researcher selects or
// configures analyses. Categories are shown only when methodologically
// compatible with the study, and statistical premises are always surfaced.

const CATEGORIES = [
  { icon: Clock, title: 'Temporal', items: ['Eventos por intervalo', 'Latência', 'Janelas pré/pós-evento', 'Séries alinhadas por evento'] },
  { icon: Video, title: 'Vídeo', items: ['Landmarks', 'Unidades de ação', 'Pose da cabeça', 'Frequência de piscadas'] },
  { icon: Activity, title: 'EEG', items: ['Potência espectral', 'Bandas de frequência', 'ERP', 'Conectividade / coerência'] },
  { icon: Layers, title: 'Multimodal', items: ['Coocorrência temporal', 'Correlação cruzada', 'Atraso entre sinais', 'Fusão de features'] },
  { icon: Sigma, title: 'Estatística', items: ['Descritiva', 'Testes de hipótese', 'Modelos mistos', 'Tamanho de efeito'] },
];

export function AnalysisIndexPage() {
  return (
    <div className="min-h-full bg-slate-50/50 pb-12">
      <PageHeader
        title="Análises"
        description="Workspace configurável. Selecione ou configure análises temporais, de vídeo, de EEG, multimodais e estatísticas conforme o desenho do estudo."
        actions={
          <Link to="/app/sessions/0048/analysis" className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Abrir workspace sincronizado
          </Link>
        }
      />
      <div className="px-6 pt-6 space-y-6">
        <ScientificCaveat variant="association" />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {CATEGORIES.map((c) => (
            <div key={c.title} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center"><c.icon size={16} /></div>
                <h3 className="text-sm font-semibold text-slate-800">Análise {c.title.toLowerCase()}</h3>
              </div>
              <ul className="space-y-1.5">
                {c.items.map((it) => (
                  <li key={it} className="flex items-center gap-2 text-[13px] text-slate-600">
                    <span className="w-1 h-1 rounded-full bg-slate-300" />{it}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-2">Como os dados são distinguidos</h3>
          <p className="text-[12px] text-slate-500 mb-3">Todos os resultados diferenciam visualmente a natureza do dado — observado, detectado, derivado, estimado por modelo, excluído, ausente ou imputado.</p>
          <ProvenanceLegend />
        </div>

        <p className="text-[12px] text-slate-400">
          A interface não recomenda automaticamente um teste estatístico sem apresentar as premissas necessárias (normalidade, independência, homocedasticidade, correção para múltiplas comparações e análise de poder).
        </p>
      </div>
    </div>
  );
}
