import { useNavigate } from 'react-router-dom';
import { Plus, Upload, FileText, Server, Activity, Clock, ArrowRight, Waypoints, LineChart } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ActionButton } from '@/components/ui/ActionButton';

// Dashboard Features
import { KpiGrid } from '@/features/dashboard/components/KpiGrid';
import { ProcessingVolumeChart } from '@/features/dashboard/components/ProcessingVolumeChart';
import { MicroActionsChart } from '@/features/dashboard/components/MicroActionsChart';
import { RecentProcessingList } from '@/features/dashboard/components/RecentProcessingList';
import { RecentStudiesList } from '@/features/dashboard/components/RecentStudiesList';
import { QualityAlertsPanel } from '@/features/dashboard/components/QualityAlertsPanel';
import { GovernanceSummary } from '@/features/dashboard/components/GovernanceSummary';

import { useGlobalDashboard } from '@/features/dashboard/useDashboard';
import { useGovernanceSummary } from '@/features/multimodal/useMultimodal';

// Mocks para partes ainda não implementadas na API

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: dashboardData, isLoading, dataUpdatedAt } = useGlobalDashboard();
  const { data: governance } = useGovernanceSummary();

  // Header Context Badges
  const headerContext = (
    <>
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-surface text-[11px] font-semibold text-text-secondary shadow-sm">
        <Server size={12} className="text-text-muted" />
        Ambiente: {(import.meta.env.VITE_ENV as string | undefined) ?? 'local'}
      </span>
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-blue-200 bg-blue-50 text-[11px] font-semibold text-blue-700 shadow-sm">
        <Activity size={12} className="text-blue-500" />
        Registro de modelos
      </span>
      <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-semibold shadow-sm ${!dashboardData ? 'border-border bg-surface-muted text-text-secondary' : dashboardData.kpis.failed_jobs ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${!dashboardData ? 'bg-slate-400' : dashboardData.kpis.failed_jobs ? 'bg-red-500' : 'bg-emerald-500'}`} />
        {!dashboardData ? 'Estado aguardando dados' : dashboardData.kpis.failed_jobs ? `${dashboardData.kpis.failed_jobs} falha(s) registradas` : 'Sem falhas registradas'}
      </span>
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-surface-muted text-[11px] font-medium text-text-secondary shadow-sm">
        <Clock size={12} />
        {dataUpdatedAt ? `Atualizado ${new Date(dataUpdatedAt).toLocaleString('pt-BR')}` : 'Aguardando dados'}
      </span>
    </>
  );

  return (
    <div className="min-h-full bg-app-bg pb-12">
      {/* 1. Header Executivo */}
      <PageHeader
        title="Visão Executiva"
        description="Acompanhamento operacional dos estudos, pipeline de processamento de vídeos e indicadores de qualidade dos dados."
        context={headerContext}
        actions={
          <div className="flex items-center gap-3">
            <ActionButton
              variant="tertiary"
              icon={FileText}
              onClick={() => navigate('/app/reports')}
            >
              Relatório
            </ActionButton>
            <ActionButton
              variant="secondary"
              icon={Upload}
              onClick={() => navigate('/app/videos')}
            >
              Enviar Vídeo
            </ActionButton>
            <ActionButton
              variant="primary"
              icon={Plus}
              onClick={() => navigate('/app/projects')}
            >
              Novo Projeto
            </ActionButton>
          </div>
        }
      />

      <div className="p-6 md:p-8 space-y-8 max-w-[1600px] mx-auto animate-fade-in">
        <section aria-label="Fluxo do pesquisador" className="grid gap-3 md:grid-cols-3">
          {[
            { label: '1 · Coletar ou importar', detail: 'Vídeo, EEG/XDF e marcadores', icon: Upload, to: '/app/acquisition' },
            { label: '2 · Revisar sessões', detail: 'Qualidade e sincronização', icon: Waypoints, to: '/app/sessions' },
            { label: '3 · Explorar resultados', detail: 'Sinais, eventos e comparações', icon: LineChart, to: '/app/analysis' },
          ].map((step) => (
            <button key={step.to} type="button" onClick={() => navigate(step.to)} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/40">
              <span className="rounded-lg bg-blue-50 p-2 text-blue-700"><step.icon size={17} /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-text-primary">{step.label}</span><span className="mt-0.5 block text-[11px] text-text-muted">{step.detail}</span></span>
              <ArrowRight size={15} className="text-text-muted" />
            </button>
          ))}
        </section>
        
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="w-8 h-8 rounded-full border-4 border-border border-t-blue-600 animate-spin" />
          </div>
        ) : dashboardData ? (
          <>
            {/* 2. KPIs Operacionais */}
            <KpiGrid kpis={[
              {
                id: 'active-projects',
                label: 'Projetos ativos',
                value: dashboardData.kpis?.active_projects || 0,
                description: 'Projetos com estudos em andamento',
                icon: 'FolderKanban',
                color: 'info',
              },
              {
                id: 'ongoing-studies',
                label: 'Estudos em andamento',
                value: dashboardData.kpis?.ongoing_studies || 0,
                description: 'Coleta de dados ativa',
                icon: 'FlaskConical',
                color: 'info',
              },
              {
                id: 'total-sessions',
                label: 'Sessões coletadas',
                value: dashboardData.kpis?.total_sessions || 0,
                description: 'Total de sessões com vídeo registrado',
                icon: 'Users',
                color: 'default',
              },
              {
                id: 'videos-processed',
                label: 'Vídeos processados',
                value: dashboardData.kpis?.videos_processed || 0,
                description: 'Total de vídeos analisados',
                icon: 'Video',
                color: 'success',
              },
              {
                id: 'avg-quality',
                label: 'Taxa média de qualidade',
                value: ((dashboardData.kpis?.average_quality || 0) * 100).toFixed(1) + '%',
                description: 'Face detection rate médio',
                icon: 'ShieldCheck',
                color: 'success',
              },
              {
                id: 'failed-jobs',
                label: 'Jobs com falha',
                value: dashboardData.kpis?.failed_jobs || 0,
                description: 'Jobs que requerem atenção',
                icon: 'AlertTriangle',
                color: 'danger',
              },
            ]} />

            {/* 3. Análise temporal e distribuição */}
            <section aria-label="Análise de dados" className="grid grid-cols-1 xl:grid-cols-5 gap-5">
              <ProcessingVolumeChart data={dashboardData.processing_time_series} />
              <MicroActionsChart data={dashboardData.microaction_distribution} />
            </section>

            {/* 4. Operação recente e alertas */}
            <section aria-label="Operação e Governança" className="grid grid-cols-1 xl:grid-cols-12 gap-5">
              {/* Listas operacionais (Esquerda, 8 colunas) */}
              <div className="xl:col-span-8 flex flex-col gap-5">
                <RecentProcessingList jobs={dashboardData.recent_jobs} />
                <RecentStudiesList studies={dashboardData.recent_studies} />
              </div>

              {/* Painéis de Atenção/Governança (Direita, 4 colunas) */}
              <div className="xl:col-span-4 flex flex-col gap-5">
                <QualityAlertsPanel alerts={[
                  ...(dashboardData.kpis.failed_jobs > 0 ? [{
                    id: 'failed-jobs',
                    title: 'Falhas no pipeline',
                    description: `${dashboardData.kpis.failed_jobs} job(s) requerem revisão.`,
                    type: 'error' as const,
                  }] : []),
                  ...(dashboardData.kpis.average_quality < 0.8 ? [{
                    id: 'quality',
                    title: 'Qualidade abaixo do alvo',
                    description: `Taxa agregada em ${(dashboardData.kpis.average_quality * 100).toFixed(1)}%.`,
                    type: 'warning' as const,
                  }] : []),
                ]} />
                <GovernanceSummary
                  data={{
                    activeModel: 'Registro de modelos',
                    lastEvaluation: 'Consulte modelos',
                    validConsents: governance?.total_participants
                      ? `${Math.round((governance.active_consents / governance.total_participants) * 100)}%`
                      : '—',
                    auditLogsCount: (governance?.recent_accesses ?? 0) + (governance?.recent_exports ?? 0),
                  }}
                  onOpen={() => navigate('/app/governance')}
                />
              </div>
            </section>
          </>
        ) : (
          <div className="text-center text-text-secondary py-12">Falha ao carregar o dashboard.</div>
        )}

      </div>
    </div>
  );
}
