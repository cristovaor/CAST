// ============================================================
// CAST Pro — Multimodal Research Domain Types
// ------------------------------------------------------------
// These types model the platform as a configurable, reusable
// scientific environment for synchronized multimodal analysis
// (video + EEG + experimental events), NOT an education-only tool.
//
// Design principle (see docs §4): the model keeps OBSERVED data,
// CAPTURED signals, PROCESSED data, FEATURES, human ANNOTATIONS,
// model PREDICTIONS and STATISTICAL associations as distinct kinds.
// The UI must never turn a temporal association into a causal claim.
// ============================================================

// ─── Study design ────────────────────────────────────────────

// Experimental designs are open — never limited to pre/post-test.
export type ExperimentalDesign =
  | 'observational'
  | 'experimental'
  | 'quasi_experimental'
  | 'cross_sectional'
  | 'longitudinal'
  | 'within_subject'
  | 'between_groups'
  | 'crossover'
  | 'pilot'
  | 'exploratory'
  | 'validation'
  | 'replication'
  | 'custom';

export const EXPERIMENTAL_DESIGNS: { value: ExperimentalDesign; label: string; hint: string }[] = [
  { value: 'observational', label: 'Observacional', hint: 'Sem manipulação de variáveis independentes.' },
  { value: 'experimental', label: 'Experimental', hint: 'Manipulação controlada com atribuição a condições.' },
  { value: 'quasi_experimental', label: 'Quase-experimental', hint: 'Grupos sem randomização completa.' },
  { value: 'cross_sectional', label: 'Transversal', hint: 'Medição em um único momento.' },
  { value: 'longitudinal', label: 'Longitudinal', hint: 'Múltiplos momentos ao longo do tempo.' },
  { value: 'within_subject', label: 'Intraindivíduo', hint: 'Cada participante passa por todas as condições.' },
  { value: 'between_groups', label: 'Intergrupos', hint: 'Grupos distintos por condição.' },
  { value: 'crossover', label: 'Crossover', hint: 'Ordem de condições contrabalanceada.' },
  { value: 'pilot', label: 'Piloto', hint: 'Estudo preliminar de viabilidade.' },
  { value: 'exploratory', label: 'Exploratório', hint: 'Sem hipótese confirmatória pré-registrada.' },
  { value: 'validation', label: 'Validação', hint: 'Avaliação de instrumento, modelo ou protocolo.' },
  { value: 'replication', label: 'Replicação', hint: 'Reprodução de um estudo anterior.' },
  { value: 'custom', label: 'Customizado', hint: 'Desenho definido livremente pelo pesquisador.' },
];

// The phenomenon under study is open — the UI must not assume it.
export type StudyFocus =
  | 'attention' | 'memory' | 'learning' | 'decision_making' | 'fatigue'
  | 'drowsiness' | 'mental_effort' | 'stimulus_response' | 'hci' | 'usability'
  | 'workload' | 'behavioral_patterns' | 'engagement' | 'task_performance'
  | 'observable_emotion' | 'motor_coordination' | 'rehabilitation'
  | 'neuroergonomics' | 'training' | 'condition_comparison' | 'material_evaluation'
  | 'interface_evaluation' | 'longitudinal' | 'exploratory_signal' | 'other';

// ─── Modalities ──────────────────────────────────────────────

export type Modality =
  | 'video'
  | 'eeg'
  | 'events'
  | 'tests'
  | 'questionnaires'
  | 'behavioral'
  | 'auxiliary';

export const MODALITIES: { value: Modality; label: string; description: string; core: boolean }[] = [
  { value: 'video', label: 'Vídeo', description: 'Vídeo facial ou comportamental.', core: true },
  { value: 'eeg', label: 'EEG', description: 'Sinais de eletroencefalografia.', core: true },
  { value: 'events', label: 'Eventos experimentais', description: 'Marcadores, triggers e estímulos.', core: false },
  { value: 'tests', label: 'Testes', description: 'Tarefas cognitivas e testes de desempenho.', core: false },
  { value: 'questionnaires', label: 'Questionários / escalas', description: 'Instrumentos psicométricos.', core: false },
  { value: 'behavioral', label: 'Respostas comportamentais', description: 'Respostas, latências, escolhas.', core: false },
  { value: 'auxiliary', label: 'Dados auxiliares', description: 'Demografia controlada e outras variáveis.', core: false },
];

// ─── Variables (§14) ─────────────────────────────────────────

export type VariableRole =
  | 'independent' | 'dependent' | 'covariate' | 'confounder'
  | 'moderator' | 'mediator' | 'primary_outcome' | 'secondary_outcome'
  | 'exploratory';

export type VariableOrigin =
  | 'raw_video' | 'raw_eeg' | 'video_feature' | 'eeg_feature'
  | 'event' | 'annotation' | 'questionnaire' | 'test'
  | 'experimental' | 'derived' | 'model_output' | 'statistic';

export type VariableType = 'numeric' | 'categorical' | 'ordinal' | 'boolean' | 'datetime' | 'text';

export interface ResearchVariable {
  id: string;
  name: string;
  code: string;
  description?: string;
  type: VariableType;
  unit?: string;
  domain?: string;
  origin: VariableOrigin;
  granularity?: string;
  modality?: Modality;
  computationMethod?: string;
  version?: string;
  missingPolicy?: string;
  allowedValues?: string[];
  owner?: string;
  role: VariableRole;
  validationStatus: 'draft' | 'in_review' | 'validated' | 'deprecated';
}

// ─── Hypotheses & conditions ─────────────────────────────────

export interface Hypothesis {
  id: string;
  code: string;              // e.g. H1
  statement: string;
  kind: 'directional' | 'non_directional' | 'null' | 'exploratory';
  relatedVariableIds?: string[];
}

export interface ExperimentalCondition {
  id: string;
  code: string;
  name: string;
  description?: string;
  stimuli?: string[];
  tasks?: string[];
}

export interface Group {
  id: string;
  code: string;
  name: string;
  description?: string;
  inclusionCriteria?: string[];
  exclusionCriteria?: string[];
}

// ─── Rich study (superset of the legacy Study) ───────────────

export interface StudyConfig {
  researchQuestion?: string;
  generalObjective?: string;
  specificObjectives?: string[];
  hypotheses: Hypothesis[];
  design: ExperimentalDesign;
  focus?: StudyFocus;
  groups: Group[];
  conditions: ExperimentalCondition[];
  modalities: Modality[];
  variables: ResearchVariable[];
  inclusionCriteria?: string[];
  exclusionCriteria?: string[];
  analysisPlan?: string;
  temporalWindows?: { label: string; startMs: number; endMs: number }[];
  eventsOfInterest?: string[];
  retentionPolicy?: string;
  ethicsApprovalRef?: string;
}

// ─── Session states (§8) ─────────────────────────────────────

export type SessionState =
  | 'draft'
  | 'awaiting_data'
  | 'incomplete'
  | 'ready_to_sync'
  | 'syncing'
  | 'synced'
  | 'processing'
  | 'processed'
  | 'review_required'
  | 'approved'
  | 'excluded'
  | 'archived';

export const SESSION_STATE_META: Record<SessionState, { label: string; tone: DataTone }> = {
  draft: { label: 'Rascunho', tone: 'neutral' },
  awaiting_data: { label: 'Aguardando dados', tone: 'neutral' },
  incomplete: { label: 'Dados incompletos', tone: 'warning' },
  ready_to_sync: { label: 'Pronta para sincronização', tone: 'info' },
  syncing: { label: 'Sincronizando', tone: 'info' },
  synced: { label: 'Sincronizada', tone: 'success' },
  processing: { label: 'Processando', tone: 'info' },
  processed: { label: 'Processada', tone: 'success' },
  review_required: { label: 'Requer revisão', tone: 'warning' },
  approved: { label: 'Aprovada', tone: 'success' },
  excluded: { label: 'Excluída', tone: 'danger' },
  archived: { label: 'Arquivada', tone: 'neutral' },
};

export type DataTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

// ─── Quality verdicts (shared by video & EEG) ────────────────

export type QualityVerdict = 'approved' | 'approved_with_caveats' | 'review_required' | 'rejected';

export const QUALITY_VERDICT_META: Record<QualityVerdict, { label: string; tone: DataTone }> = {
  approved: { label: 'Aprovado', tone: 'success' },
  approved_with_caveats: { label: 'Aprovado com ressalvas', tone: 'warning' },
  review_required: { label: 'Requer revisão', tone: 'warning' },
  rejected: { label: 'Rejeitado', tone: 'danger' },
};

export interface QualityFinding {
  id: string;
  issue: string;         // problema
  evidence: string;      // evidência
  impact: string;        // impacto provável
  recommendation: string;// ação recomendada
  reprocessable: boolean;
  tone: DataTone;
}

// ─── Video import & quality (§9) ─────────────────────────────

export interface VideoImportReport {
  format?: string;
  codec?: string;
  resolution?: string;
  frameRate?: number;
  durationSeconds?: number;
  rotation?: number;
  faceDetected?: boolean;
  faceCount?: number;
  validFrameRatio?: number;      // 0..1
  temporalStability?: number;    // 0..1
  startTimestamp?: string;
  device?: string;
  droppedFrames?: number;
  verdict: QualityVerdict;
  findings: QualityFinding[];
}

// ─── EEG import & quality (§10) ──────────────────────────────

export type EEGFileFormat =
  | 'EDF' | 'EDF+' | 'BDF' | 'BrainVision' | 'FIF' | 'EEGLAB' | 'CSV' | 'proprietary';

export const EEG_FORMATS: EEGFileFormat[] = [
  'EDF', 'EDF+', 'BDF', 'BrainVision', 'FIF', 'EEGLAB', 'CSV', 'proprietary',
];

export interface EEGChannelQuality {
  name: string;
  status: 'good' | 'noisy' | 'flat' | 'missing' | 'bad';
  impedanceKOhm?: number;
  validRatio: number;   // 0..1
  notes?: string;
}

export interface EEGImportReport {
  format: EEGFileFormat;
  device?: string;
  manufacturer?: string;
  model?: string;
  channelCount: number;
  channelNames: string[];
  montage?: string;
  reference?: string;
  samplingRateHz: number;
  resolutionBits?: number;
  startTimestamp?: string;
  durationSeconds?: number;
  units?: string;
  eventCount?: number;
  hasImpedance?: boolean;
  hasElectrodeFile?: boolean;
  // Quality
  validRatio: number;    // percentual válido, 0..1
  channelQuality: EEGChannelQuality[];
  criteria: string[];    // critérios utilizados
  detectionParams?: Record<string, string | number>;
  verdict: QualityVerdict;
  findings: QualityFinding[];
}

// ─── Synchronization (§11) ───────────────────────────────────

export type SyncMethod =
  | 'absolute_timestamp' | 'hardware_trigger' | 'digital_marker'
  | 'visual_event' | 'audio_event' | 'reference_frame'
  | 'manual' | 'event_correlation' | 'informed_offset' | 'semi_automatic';

export const SYNC_METHODS: { value: SyncMethod; label: string }[] = [
  { value: 'absolute_timestamp', label: 'Timestamp absoluto' },
  { value: 'hardware_trigger', label: 'Trigger de hardware' },
  { value: 'digital_marker', label: 'Marcador digital' },
  { value: 'visual_event', label: 'Evento visual' },
  { value: 'audio_event', label: 'Evento sonoro' },
  { value: 'reference_frame', label: 'Frame de referência' },
  { value: 'manual', label: 'Ajuste manual' },
  { value: 'event_correlation', label: 'Correlação entre eventos' },
  { value: 'informed_offset', label: 'Offset informado' },
  { value: 'semi_automatic', label: 'Alinhamento semiautomático' },
];

export type SyncState =
  | 'not_synced' | 'auto_available' | 'in_review'
  | 'synced' | 'synced_with_caveats' | 'sync_failed';

export const SYNC_STATE_META: Record<SyncState, { label: string; tone: DataTone }> = {
  not_synced: { label: 'Não sincronizado', tone: 'neutral' },
  auto_available: { label: 'Sincronização automática disponível', tone: 'info' },
  in_review: { label: 'Sincronização em revisão', tone: 'warning' },
  synced: { label: 'Sincronizado', tone: 'success' },
  synced_with_caveats: { label: 'Sincronizado com ressalvas', tone: 'warning' },
  sync_failed: { label: 'Falha de sincronização', tone: 'danger' },
};

export interface SyncAnchor {
  id: string;
  label: string;
  videoTimeMs: number;
  eegTimeMs: number;
}

export interface SyncModel {
  state: SyncState;
  method?: SyncMethod;
  offsetMs: number;
  driftMsPerMin?: number;
  confidence?: number;   // 0..1
  anchors: SyncAnchor[];
  history: { at: string; by: string; action: string; note?: string }[];
}

// ─── Datasets (§17) ──────────────────────────────────────────

export type DatasetLevel =
  | 'raw' | 'synced' | 'preprocessed' | 'features'
  | 'events' | 'analytic' | 'training' | 'validation' | 'publication';

export type DatasetState =
  | 'draft' | 'building' | 'validating' | 'frozen'
  | 'published_internal' | 'superseded' | 'archived';

export const DATASET_STATE_META: Record<DatasetState, { label: string; tone: DataTone }> = {
  draft: { label: 'Rascunho', tone: 'neutral' },
  building: { label: 'Em construção', tone: 'info' },
  validating: { label: 'Em validação', tone: 'warning' },
  frozen: { label: 'Congelado', tone: 'success' },
  published_internal: { label: 'Publicado internamente', tone: 'success' },
  superseded: { label: 'Superseded', tone: 'neutral' },
  archived: { label: 'Arquivado', tone: 'neutral' },
};

export interface DatasetManifest {
  datasetVersion: string;
  level: DatasetLevel;
  sourceStudies: string[];
  participantCount: number;
  sessionCount: number;
  conditions: string[];
  modalities: Modality[];
  inclusionCriteria: string[];
  exclusionCriteria: string[];
  temporalWindows?: string[];
  minQuality?: string;
  transformations: string[];
  pipelineVersions: string[];
  modelVersions: string[];
  schemaRef?: string;
  dataDictionaryRef?: string;
  lineageRef?: string;
  checksum?: string;
  missingDataPolicy?: string;
  generatedAt: string;
  owner: string;
}

export interface DatasetVersion {
  id: string;
  name: string;
  level: DatasetLevel;
  state: DatasetState;
  manifest: DatasetManifest;
  createdAt: string;
}

// ─── Model registry risks (§18) ──────────────────────────────

export type ModelRisk =
  | 'small_sample' | 'imbalance' | 'overfitting' | 'participant_leakage'
  | 'low_calibration' | 'low_external_validation' | 'group_disparity'
  | 'device_dependence' | 'protocol_dependence' | 'sampling_mismatch'
  | 'drift' | 'domain_shift';

export const MODEL_RISK_LABELS: Record<ModelRisk, string> = {
  small_sample: 'Amostra pequena',
  imbalance: 'Desbalanceamento',
  overfitting: 'Overfitting',
  participant_leakage: 'Vazamento entre participantes',
  low_calibration: 'Baixa calibração',
  low_external_validation: 'Baixa validação externa',
  group_disparity: 'Desempenho desigual entre grupos',
  device_dependence: 'Dependência de dispositivo',
  protocol_dependence: 'Dependência de protocolo',
  sampling_mismatch: 'Incompatibilidade de taxas de amostragem',
  drift: 'Drift',
  domain_shift: 'Mudança de domínio',
};

export type ModelInputModality = 'video' | 'eeg' | 'multimodal' | 'statistical';

// ─── Provenance kinds — how the UI must distinguish data (§20) ─

export type ProvenanceKind =
  | 'video_observed' | 'eeg_observed' | 'human_annotation'
  | 'detected_event' | 'derived_feature' | 'model_estimate'
  | 'excluded' | 'missing' | 'imputed' | 'aggregate';

export const PROVENANCE_META: Record<ProvenanceKind, { label: string; color: string }> = {
  video_observed: { label: 'Vídeo observado', color: '#2563EB' },
  eeg_observed: { label: 'EEG observado', color: '#0891B2' },
  human_annotation: { label: 'Anotação humana', color: '#7C3AED' },
  detected_event: { label: 'Evento detectado', color: '#D97706' },
  derived_feature: { label: 'Feature derivada', color: '#059669' },
  model_estimate: { label: 'Estimativa de modelo', color: '#DB2777' },
  excluded: { label: 'Dado excluído', color: '#DC2626' },
  missing: { label: 'Dado ausente', color: '#94A3B8' },
  imputed: { label: 'Dado imputado', color: '#A855F7' },
  aggregate: { label: 'Resultado agregado', color: '#334155' },
};

// ─── Chart metadata contract (§20) ───────────────────────────
// Every scientific chart must carry this context.
export interface ChartMeta {
  title: string;
  description?: string;
  source?: string;
  unit?: string;
  sampleSize?: number;     // n participantes
  sessionCount?: number;
  filters?: string[];
  granularity?: string;
  modality?: Modality | 'multimodal';
  datasetVersion?: string;
  pipelineVersion?: string;
  modelVersion?: string;
  missingData?: string;
  params?: Record<string, string | number>;
}
