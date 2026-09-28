import type { Study, ProcessingJob, TimeSeriesPoint, ChartDataPoint, KPICardData } from '@/types/domain';

// ─── KPI Cards ────────────────────────────────────────────────

export const DASHBOARD_KPIS: KPICardData[] = [
  {
    id: 'active-projects',
    label: 'Projetos ativos',
    value: 8,
    description: 'Projetos com estudos em andamento',
    trend: { value: '+2 este mês', direction: 'up', isPositive: true },
    icon: 'FolderKanban',
    color: 'info',
  },
  {
    id: 'ongoing-studies',
    label: 'Estudos em andamento',
    value: 14,
    description: 'Coleta de dados ativa',
    trend: { value: '+3 esta semana', direction: 'up', isPositive: true },
    icon: 'FlaskConical',
    color: 'info',
  },
  {
    id: 'total-sessions',
    label: 'Sessões coletadas',
    value: 237,
    description: 'Total de sessões com vídeo registrado',
    trend: { value: '+42 esta semana', direction: 'up', isPositive: true },
    icon: 'Users',
    color: 'default',
  },
  {
    id: 'videos-processed',
    label: 'Vídeos processados',
    value: 143,
    description: 'Total de vídeos analisados pelo pipeline de microações',
    trend: { value: '+18 esta semana', direction: 'up', isPositive: true },
    icon: 'Video',
    color: 'success',
  },
  {
    id: 'avg-quality',
    label: 'Taxa média de qualidade',
    value: '94,2%',
    description: 'Face detection rate médio dos vídeos processados',
    trend: { value: '+1.2% este mês', direction: 'up', isPositive: true },
    icon: 'ShieldCheck',
    color: 'success',
  },
  {
    id: 'failed-jobs',
    label: 'Jobs com falha',
    value: 3,
    description: 'Jobs que requerem atenção ou reprocessamento',
    trend: { value: '-2 vs semana anterior', direction: 'down', isPositive: true },
    icon: 'AlertTriangle',
    color: 'danger',
  },
];

// ─── Processing Time Series (12 weeks) ───────────────────────

export const PROCESSING_TIME_SERIES: TimeSeriesPoint[] = [
  { date: '25/03', value: 8  },
  { date: '01/04', value: 12 },
  { date: '08/04', value: 9  },
  { date: '15/04', value: 18 },
  { date: '22/04', value: 14 },
  { date: '29/04', value: 22 },
  { date: '06/05', value: 19 },
  { date: '13/05', value: 25 },
  { date: '20/05', value: 21 },
  { date: '27/05', value: 28 },
  { date: '03/06', value: 16 },
  { date: '10/06', value: 18 },
];

// ─── Micro-action Distribution ────────────────────────────────

export const MICROACTION_DISTRIBUTION: ChartDataPoint[] = [
  { name: 'USP 2026', OLHO_FECHADO: 45, OLHANDO_CANTO: 122, MEXEU_LABIOS: 38, VIROU_ROSTO: 67 },
  { name: 'UNICAMP Bio', OLHO_FECHADO: 62, OLHANDO_CANTO: 89, MEXEU_LABIOS: 55, VIROU_ROSTO: 41 },
  { name: 'PUCRS EaD', OLHO_FECHADO: 28, OLHANDO_CANTO: 145, MEXEU_LABIOS: 19, VIROU_ROSTO: 88 },
  { name: 'Mackenzie', OLHO_FECHADO: 71, OLHANDO_CANTO: 93, MEXEU_LABIOS: 44, VIROU_ROSTO: 52 },
  { name: 'IFSP Lit.', OLHO_FECHADO: 35, OLHANDO_CANTO: 76, MEXEU_LABIOS: 61, VIROU_ROSTO: 29 },
];

// ─── Recent Processing Jobs ───────────────────────────────────

export const RECENT_JOBS: ProcessingJob[] = [
  {
    id: 'a1b2c3d-0001',
    video_asset_id: 'vid-001',
    job_type: 'extract_landmarks',
    status: 'succeeded',
    progress: 100,
    started_at: '2026-06-13T18:30:00Z',
    finished_at: '2026-06-13T18:43:00Z',
    worker_id: 'worker-01',
    current_step: 'Gerando relatório',
    video_filename: 'sessao_P1001_bloco2.mp4',
    study_name: 'Estudo Cognitivo USP 2026',
    elapsed_seconds: 780,
  },
  {
    id: 'a1b2c3d-0002',
    video_asset_id: 'vid-002',
    job_type: 'extract_landmarks',
    status: 'running',
    progress: 67,
    started_at: '2026-06-13T19:05:00Z',
    worker_id: 'worker-02',
    current_step: 'Executando inferência',
    video_filename: 'sessao_P2034_bloco1.mp4',
    study_name: 'UNICAMP Bio 2026',
    elapsed_seconds: 240,
  },
  {
    id: 'a1b2c3d-0003',
    video_asset_id: 'vid-003',
    job_type: 'extract_landmarks',
    status: 'failed',
    progress: 28,
    started_at: '2026-06-13T17:55:00Z',
    finished_at: '2026-06-13T17:59:00Z',
    worker_id: 'worker-01',
    current_step: 'Falha',
    video_filename: 'sessao_P0892_bloco3.mp4',
    study_name: 'PUCRS EaD Engenharia',
    error_message: 'Face detection rate abaixo do mínimo (12.3%). Vídeo rejeitado.',
    elapsed_seconds: 210,
  },
  {
    id: 'a1b2c3d-0004',
    video_asset_id: 'vid-004',
    job_type: 'extract_landmarks',
    status: 'queued',
    progress: 0,
    video_filename: 'sessao_P3301_bloco1.mp4',
    study_name: 'Mackenzie Lit. Digital',
    elapsed_seconds: 0,
  },
  {
    id: 'a1b2c3d-0005',
    video_asset_id: 'vid-005',
    job_type: 'extract_landmarks',
    status: 'succeeded',
    progress: 100,
    started_at: '2026-06-13T16:10:00Z',
    finished_at: '2026-06-13T16:24:00Z',
    worker_id: 'worker-03',
    current_step: 'Gerando relatório',
    video_filename: 'sessao_P0451_bloco4.mp4',
    study_name: 'IFSP Literacia',
    elapsed_seconds: 840,
  },
];

// ─── Recent Studies ───────────────────────────────────────────

export const RECENT_STUDIES: Study[] = [
  {
    id: 'study-001',
    project_id: 'proj-001',
    name: 'Estudo Cognitivo USP 2026',
    description: 'Análise de carga cognitiva em estudantes de graduação durante aprendizagem multimídia.',
    status: 'active',
    protocol_version: 'v2.1',
    created_at: '2026-03-15T10:00:00Z',
    participant_count: 42,
    session_count: 38,
    video_count: 38,
    average_quality: 0.94,
  },
  {
    id: 'study-002',
    project_id: 'proj-002',
    name: 'UNICAMP Bioquímica 2026',
    description: 'Estudo de microações em aulas práticas de laboratório remoto.',
    status: 'active',
    protocol_version: 'v1.3',
    created_at: '2026-04-02T09:00:00Z',
    participant_count: 28,
    session_count: 24,
    video_count: 22,
    average_quality: 0.89,
  },
  {
    id: 'study-003',
    project_id: 'proj-003',
    name: 'PUCRS Engenharia EaD',
    description: 'Padrões de atenção em disciplinas de engenharia no modelo híbrido.',
    status: 'draft',
    protocol_version: 'v1.0',
    created_at: '2026-05-20T14:00:00Z',
    participant_count: 15,
    session_count: 8,
    video_count: 6,
    average_quality: 0.71,
  },
  {
    id: 'study-004',
    project_id: 'proj-004',
    name: 'Mackenzie Literacia Digital',
    description: 'Estudo longitudinal de carga cognitiva em literacia digital — ensino médio.',
    status: 'active',
    protocol_version: 'v1.1',
    created_at: '2026-02-10T08:00:00Z',
    participant_count: 67,
    session_count: 61,
    video_count: 58,
    average_quality: 0.92,
  },
];

// ─── Quality Alerts ───────────────────────────────────────────

type QualityAlertMock = { id: string; title: string; description: string; type: 'warning' | 'info' | 'error' };

export const QUALITY_ALERTS: QualityAlertMock[] = [
  { id: 'qa-1', title: 'Qualidade Baixa', description: '3 vídeos com face detection rate abaixo de 80%', type: 'warning' },
  { id: 'qa-2', title: 'Falha no Pipeline', description: '2 jobs falharam no extract_landmarks', type: 'error' },
  { id: 'qa-3', title: 'Governança', description: '1 estudo sem termo de consentimento associado', type: 'info' },
  { id: 'qa-4', title: 'Revisão Necessária', description: 'Modelo ativo sem avaliação recente', type: 'warning' }
];

// ─── Governance Summary ───────────────────────────────────────

export const GOVERNANCE_SUMMARY = {
  activeModel: 'cast-lstm-v1',
  lastEvaluation: '10 jun. 2026',
  validConsents: '98%',
  auditLogsCount: 1248
};
