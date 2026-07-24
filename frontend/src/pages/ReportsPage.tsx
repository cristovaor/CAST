import { useState } from 'react';
import { BarChart3, Download, FileText, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useStudies } from '@/features/studies/useStudies';
import { useStudyReports, useGenerateReport, downloadDynamicPdf } from '@/features/reports/useReports';

export function ReportsPage() {
  const { data: studies, isLoading: loadingStudies } = useStudies();
  const [selectedStudyId, setSelectedStudyId] = useState<string>('');
  const { data: reports, isLoading: loadingReports } = useStudyReports(selectedStudyId);
  const generateReport = useGenerateReport();

  const handleGeneratePdf = () => {
    if (!selectedStudyId) return;
    downloadDynamicPdf(selectedStudyId);
  };

  const handleGenerateCsv = () => {
    if (!selectedStudyId) return;
    generateReport.mutate({ studyId: selectedStudyId, format: 'csv' });
  };

  return (
    <div className="min-h-full">
      <PageHeader
        title="Relatórios Clínicos"
        description="Gere laudos clínicos em PDF, exporte dados em CSV e acompanhe o histórico de relatórios gerados."
        actions={
          <>
            <button
              onClick={handleGenerateCsv}
              disabled={!selectedStudyId || generateReport.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={14} />
              {generateReport.isPending ? 'Gerando...' : 'Exportar CSV'}
            </button>
            <button
              onClick={handleGeneratePdf}
              disabled={!selectedStudyId}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 rounded-lg transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText size={14} />
              Gerar Laudo Clínico (PDF)
            </button>
          </>
        }
      />

      <div className="p-6 space-y-6">
        {/* Study Selector */}
        <div className="card p-5">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Selecione o Estudo</label>
          <select
            value={selectedStudyId}
            onChange={(e) => setSelectedStudyId(e.target.value)}
            className="w-full max-w-md px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">— Escolha um estudo —</option>
            {loadingStudies ? (
              <option disabled>Carregando...</option>
            ) : (
              studies?.map((study) => (
                <option key={study.id} value={study.id}>
                  {(study as any).name || (study as any).title || `Estudo ${study.id.slice(0, 8)}`}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Reports List */}
        {!selectedStudyId ? (
          <EmptyState
            variant="empty"
            title="Nenhum estudo selecionado"
            description="Selecione um estudo acima para visualizar os relatórios gerados ou gerar um novo laudo clínico."
            icon={<BarChart3 size={40} className="text-slate-300" />}
          />
        ) : loadingReports ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : reports && reports.length > 0 ? (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">Relatórios Gerados</h3>
              <p className="text-xs text-slate-400 mt-0.5">{reports.length} relatório(s) disponível(is)</p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Gerado em</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reports.map((report) => (
                  <tr key={report.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                        <FileText size={12} />
                        {report.type === 'pdf' ? 'PDF' : report.type === 'json' ? 'JSON' : report.type.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-600">
                      {new Date(report.generated_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <a
                        href={report.download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        <Download size={12} />
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            variant="empty"
            title="Nenhum relatório encontrado"
            description="Este estudo ainda não possui relatórios gerados. Use os botões acima para gerar um laudo clínico em PDF ou exportar dados em CSV."
            icon={<BarChart3 size={40} className="text-slate-300" />}
            action={{ label: 'Gerar Laudo PDF', onClick: handleGeneratePdf }}
          />
        )}
      </div>
    </div>
  );
}
