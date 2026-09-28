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

import { lazyLabels, lazyMeta, lazyOptions } from '@/i18n/labels';

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

// Labels and hints live in the `domain` locale namespace (design.<value>).
export const EXPERIMENTAL_DESIGNS = lazyOptions<ExperimentalDesign, 'label' | 'hint'>(
  'domain:design',
  ['label', 'hint'],
  [
    'observational', 'experimental', 'quasi_experimental', 'cross_sectional',
    'longitudinal', 'within_subject', 'between_groups', 'crossover', 'pilot',
    'exploratory', 'validation', 'replication', 'custom',
  ].map((value) => ({ value: value as ExperimentalDesign })),
);

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

export const MODALITIES = lazyOptions<Modality, 'label' | 'description', { core: boolean }>(
  'domain:modality',
  ['label', 'description'],
  [
    { value: 'video', core: true },
    { value: 'eeg', core: true },
    { value: 'events', core: false },
    { value: 'tests', core: false },
    { value: 'questionnaires', core: false },
    { value: 'behavioral', core: false },
    { value: 'auxiliary', core: false },
  ],
);

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

export const SESSION_STATE_META = lazyMeta('domain:sessionState', {
  draft: { tone: 'neutral' },
  awaiting_data: { tone: 'neutral' },
  incomplete: { tone: 'warning' },
  ready_to_sync: { tone: 'info' },
  syncing: { tone: 'info' },
  synced: { tone: 'success' },
  processing: { tone: 'info' },
  processed: { tone: 'success' },
  review_required: { tone: 'warning' },
  approved: { tone: 'success' },
  excluded: { tone: 'danger' },
  archived: { tone: 'neutral' },
} satisfies Record<SessionState, { tone: DataTone }>);

export type DataTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

// ─── Quality verdicts (shared by video & EEG) ────────────────

export type QualityVerdict = 'approved' | 'approved_with_caveats' | 'review_required' | 'rejected';

export const QUALITY_VERDICT_META = lazyMeta('domain:qualityVerdict', {
  approved: { tone: 'success' },
  approved_with_caveats: { tone: 'warning' },
  review_required: { tone: 'warning' },
  rejected: { tone: 'danger' },
} satisfies Record<QualityVerdict, { tone: DataTone }>);

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
  | 'XDF' | 'EDF' | 'EDF+' | 'BDF' | 'BrainVision' | 'FIF' | 'EEGLAB' | 'CSV' | 'proprietary';

export const EEG_FORMATS: EEGFileFormat[] = [
  'XDF', 'EDF', 'EDF+', 'BDF', 'BrainVision', 'FIF', 'EEGLAB', 'CSV', 'proprietary',
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

export const SYNC_METHODS = lazyOptions<SyncMethod, 'label'>(
  'domain:syncMethod',
  ['label'],
  [
    'absolute_timestamp', 'hardware_trigger', 'digital_marker', 'visual_event',
    'audio_event', 'reference_frame', 'manual', 'event_correlation',
    'informed_offset', 'semi_automatic',
  ].map((value) => ({ value: value as SyncMethod })),
);

export type SyncState =
  | 'not_synced' | 'auto_available' | 'in_review'
  | 'synced' | 'synced_with_caveats' | 'sync_failed';

export const SYNC_STATE_META = lazyMeta('domain:syncState', {
  not_synced: { tone: 'neutral' },
  auto_available: { tone: 'info' },
  in_review: { tone: 'warning' },
  synced: { tone: 'success' },
  synced_with_caveats: { tone: 'warning' },
  sync_failed: { tone: 'danger' },
} satisfies Record<SyncState, { tone: DataTone }>);

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

export const DATASET_STATE_META = lazyMeta('domain:datasetState', {
  draft: { tone: 'neutral' },
  building: { tone: 'info' },
  validating: { tone: 'warning' },
  frozen: { tone: 'success' },
  published_internal: { tone: 'success' },
  superseded: { tone: 'neutral' },
  archived: { tone: 'neutral' },
} satisfies Record<DatasetState, { tone: DataTone }>);

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

export const MODEL_RISK_LABELS = lazyLabels<ModelRisk>('domain:modelRisk', [
  'small_sample', 'imbalance', 'overfitting', 'participant_leakage',
  'low_calibration', 'low_external_validation', 'group_disparity',
  'device_dependence', 'protocol_dependence', 'sampling_mismatch',
  'drift', 'domain_shift',
]);

export type ModelInputModality = 'video' | 'eeg' | 'multimodal' | 'statistical';

// ─── Provenance kinds — how the UI must distinguish data (§20) ─

export type ProvenanceKind =
  | 'video_observed' | 'eeg_observed' | 'human_annotation'
  | 'detected_event' | 'derived_feature' | 'model_estimate'
  | 'excluded' | 'missing' | 'imputed' | 'aggregate';

export const PROVENANCE_META = lazyMeta('domain:provenance', {
  video_observed: { color: '#2563EB' },
  eeg_observed: { color: '#0891B2' },
  human_annotation: { color: '#7C3AED' },
  detected_event: { color: '#D97706' },
  derived_feature: { color: '#059669' },
  model_estimate: { color: '#DB2777' },
  excluded: { color: '#DC2626' },
  missing: { color: '#94A3B8' },
  imputed: { color: '#A855F7' },
  aggregate: { color: '#334155' },
} satisfies Record<ProvenanceKind, { color: string }>);

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
