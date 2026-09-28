// ============================================================
// CAST Pro — Multimodal Scientific Domain Types
// Modelo de domínio para pesquisa multimodal genérica:
// vídeo + EEG sincronizados, com testes/questionários opcionais.
//
// Princípio: separar explicitamente dado observado, sinal capturado,
// dado processado, feature, anotação humana, predição de modelo,
// métrica derivada, associação estatística e interpretação.
// ============================================================

import { lazyLabels } from '@/i18n/labels';

// ─── Proveniência de dados (princípio científico central) ────

export type DataProvenance =
  | 'observed'      // dado bruto observado (vídeo, resposta)
  | 'captured'      // sinal capturado por sensor (EEG)
  | 'processed'     // dado após pré-processamento
  | 'feature'       // feature extraída
  | 'annotation'    // anotação humana
  | 'prediction'    // saída de modelo (probabilística)
  | 'derived'       // métrica derivada / agregada
  | 'statistical'   // associação estatística
  | 'interpretation'; // interpretação do pesquisador

// ─── Desenho experimental ────────────────────────────────────

export type StudyDesignType =
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

export const STUDY_DESIGN_LABELS = lazyLabels<StudyDesignType>('domain:design', ['observational', 'experimental', 'quasi_experimental', 'cross_sectional', 'longitudinal', 'within_subject', 'between_groups', 'crossover', 'pilot', 'exploratory', 'validation', 'replication', 'custom'], '.label');

export interface Hypothesis {
  id: string;
  code: string;            // H1, H2…
  statement: string;
  type: 'primary' | 'secondary' | 'exploratory';
  variables_involved: string[]; // variable codes
  status: 'draft' | 'registered' | 'testing' | 'evaluated';
}

export interface ExperimentalCondition {
  id: string;
  code: string;
  name: string;
  description?: string;
  stimuli?: string[];
  tasks?: string[];
}

export interface StudyGroup {
  id: string;
  code: string;
  name: string;
  allocation: 'randomized' | 'matched' | 'convenience' | 'single';
  target_n?: number;
}

// ─── Variáveis científicas ───────────────────────────────────

export type VariableRole =
  | 'independent'
  | 'dependent'
  | 'covariate'
  | 'confounder'
  | 'moderator'
  | 'mediator'
  | 'primary_outcome'
  | 'secondary_outcome'
  | 'exploratory';

export const VARIABLE_ROLE_LABELS = lazyLabels<VariableRole>('domain:variableRole', ['independent', 'dependent', 'covariate', 'confounder', 'moderator', 'mediator', 'primary_outcome', 'secondary_outcome', 'exploratory']);

export type VariableOrigin =
  | 'raw_video'
  | 'raw_eeg'
  | 'video_feature'
  | 'eeg_feature'
  | 'event'
  | 'annotation'
  | 'questionnaire'
  | 'test'
  | 'experimental'
  | 'derived'
  | 'model_output'
  | 'statistical';

export const VARIABLE_ORIGIN_LABELS = lazyLabels<VariableOrigin>('domain:variableOrigin', ['raw_video', 'raw_eeg', 'video_feature', 'eeg_feature', 'event', 'annotation', 'questionnaire', 'test', 'experimental', 'derived', 'model_output', 'statistical']);

export interface StudyVariable {
  id: string;
  name: string;
  code: string;
  description?: string;
  data_type: 'continuous' | 'discrete' | 'categorical' | 'ordinal' | 'binary' | 'timeseries';
  unit?: string;
  domain?: string;               // domínio/faixa de valores
  origin: VariableOrigin;
  role: VariableRole;
  granularity: 'sample' | 'window' | 'event' | 'session' | 'participant' | 'group';
  modality?: ModalityKind;
  computation?: string;          // método de cálculo
  version?: string;
  missing_policy?: string;
  responsible?: string;
  validation_status: 'draft' | 'in_review' | 'validated';
}

// ─── Modalidades ─────────────────────────────────────────────

export type ModalityKind =
  | 'video'
  | 'eeg'
  | 'events'
  | 'test'
  | 'questionnaire'
  | 'behavioral'
  | 'other';

export const MODALITY_LABELS = lazyLabels<ModalityKind>('domain:modalityKind', ['video', 'eeg', 'events', 'test', 'questionnaire', 'behavioral', 'other']);

export interface StudyModalityConfig {
  kind: ModalityKind;
  required: boolean;             // vídeo e EEG são centrais; demais opcionais
  notes?: string;
}

// ─── Estados da sessão multimodal ────────────────────────────

export type SessionState =
  | 'draft'
  | 'awaiting_data'
  | 'incomplete_data'
  | 'ready_to_sync'
  | 'syncing'
  | 'synchronized'
  | 'processing'
  | 'processed'
  | 'needs_review'
  | 'approved'
  | 'excluded'
  | 'archived';

export const SESSION_STATE_LABELS = lazyLabels<SessionState>('domain:multimodalSessionState', ['draft', 'awaiting_data', 'incomplete_data', 'ready_to_sync', 'syncing', 'synchronized', 'processing', 'processed', 'needs_review', 'approved', 'excluded', 'archived']);

// ─── EEG ─────────────────────────────────────────────────────

export type EEGFileFormat =
  | 'EDF' | 'EDF+' | 'BDF' | 'BrainVision' | 'FIF' | 'EEGLAB' | 'CSV' | 'converted';

export type EEGQualityVerdict =
  | 'adequate'
  | 'adequate_with_caveats'
  | 'needs_review'
  | 'inadequate';

export const EEG_QUALITY_LABELS = lazyLabels<EEGQualityVerdict>('domain:eegQuality', ['adequate', 'adequate_with_caveats', 'needs_review', 'inadequate']);

export type EEGChannelIssue =
  | 'missing' | 'noisy' | 'flat' | 'clipping' | 'saturation' | 'drift'
  | 'line_noise' | 'ocular_artifact' | 'muscle_artifact' | 'movement'
  | 'signal_loss' | 'discontinuity' | 'high_impedance' | 'sampling_inconsistency';

export const EEG_ISSUE_LABELS = lazyLabels<EEGChannelIssue>('domain:eegIssue', ['missing', 'noisy', 'flat', 'clipping', 'saturation', 'drift', 'line_noise', 'ocular_artifact', 'muscle_artifact', 'movement', 'signal_loss', 'discontinuity', 'high_impedance', 'sampling_inconsistency']);

export interface EEGChannelQuality {
  channel: string;
  valid_pct: number;             // % de amostras válidas
  impedance_kohm?: number;
  issues: EEGChannelIssue[];
  affected_segments: Array<{ start_s: number; end_s: number; issue: EEGChannelIssue }>;
  excluded: boolean;
}

export interface EEGRecording {
  id: string;
  session_id: string;
  filename: string;
  format: EEGFileFormat;
  device?: string;
  manufacturer?: string;
  model?: string;
  channel_count: number;
  sampling_rate_hz: number;
  duration_seconds?: number;
  start_timestamp?: string;
  provenance: DataProvenance;
}
