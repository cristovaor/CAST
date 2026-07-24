// ============================================================
// CAST Pro — Multimodal Scientific Domain Types
// Modelo de domínio para pesquisa multimodal genérica:
// vídeo + EEG sincronizados, com testes/questionários opcionais.
//
// Princípio: separar explicitamente dado observado, sinal capturado,
// dado processado, feature, anotação humana, predição de modelo,
// métrica derivada, associação estatística e interpretação.
// ============================================================

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

export const STUDY_DESIGN_LABELS: Record<StudyDesignType, string> = {
  observational: 'Observacional',
  experimental: 'Experimental',
  quasi_experimental: 'Quase-experimental',
  cross_sectional: 'Transversal',
  longitudinal: 'Longitudinal',
  within_subject: 'Intraindivíduo',
  between_groups: 'Intergrupos',
  crossover: 'Crossover',
  pilot: 'Estudo piloto',
  exploratory: 'Exploratório',
  validation: 'Validação',
  replication: 'Replicação',
  custom: 'Customizado',
};

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

export const VARIABLE_ROLE_LABELS: Record<VariableRole, string> = {
  independent: 'Independente',
  dependent: 'Dependente',
  covariate: 'Covariável',
  confounder: 'Confundidor',
  moderator: 'Moderador',
  mediator: 'Mediador',
  primary_outcome: 'Desfecho primário',
  secondary_outcome: 'Desfecho secundário',
  exploratory: 'Exploratória',
};

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

export const VARIABLE_ORIGIN_LABELS: Record<VariableOrigin, string> = {
  raw_video: 'Vídeo bruto',
  raw_eeg: 'EEG bruto',
  video_feature: 'Feature de vídeo',
  eeg_feature: 'Feature de EEG',
  event: 'Evento',
  annotation: 'Anotação',
  questionnaire: 'Questionário',
  test: 'Teste',
  experimental: 'Variável experimental',
  derived: 'Variável derivada',
  model_output: 'Saída de modelo',
  statistical: 'Cálculo estatístico',
};

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

export const MODALITY_LABELS: Record<ModalityKind, string> = {
  video: 'Vídeo',
  eeg: 'EEG',
  events: 'Eventos experimentais',
  test: 'Testes',
  questionnaire: 'Questionários',
  behavioral: 'Respostas comportamentais',
  other: 'Dados auxiliares',
};

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

export const SESSION_STATE_LABELS: Record<SessionState, string> = {
  draft: 'Rascunho',
  awaiting_data: 'Aguardando dados',
  incomplete_data: 'Dados incompletos',
  ready_to_sync: 'Pronta para sincronização',
  syncing: 'Sincronizando',
  synchronized: 'Sincronizada',
  processing: 'Processando',
  processed: 'Processada',
  needs_review: 'Requer revisão',
  approved: 'Aprovada',
  excluded: 'Excluída',
  archived: 'Arquivada',
};

// ─── EEG ─────────────────────────────────────────────────────

export type EEGFileFormat =
  | 'EDF' | 'EDF+' | 'BDF' | 'BrainVision' | 'FIF' | 'EEGLAB' | 'CSV' | 'converted';

export type EEGQualityVerdict =
  | 'adequate'
  | 'adequate_with_caveats'
  | 'needs_review'
  | 'inadequate';

export const EEG_QUALITY_LABELS: Record<EEGQualityVerdict, string> = {
  adequate: 'Adequado',
  adequate_with_caveats: 'Adequado com ressalvas',
  needs_review: 'Requer revisão',
  inadequate: 'Inadequado',
};

export type EEGChannelIssue =
  | 'missing' | 'noisy' | 'flat' | 'clipping' | 'saturation' | 'drift'
  | 'line_noise' | 'ocular_artifact' | 'muscle_artifact' | 'movement'
  | 'signal_loss' | 'discontinuity' | 'high_impedance' | 'sampling_inconsistency';

export const EEG_ISSUE_LABELS: Record<EEGChannelIssue, string> = {
  missing: 'Canal ausente',
  noisy: 'Canal ruidoso',
  flat: 'Canal plano',
  clipping: 'Clipping',
  saturation: 'Saturação',
  drift: 'Drift',
  line_noise: 'Ruído de rede',
  ocular_artifact: 'Artefato ocular',
  muscle_artifact: 'Artefato muscular',
  movement: 'Movimento',
  signal_loss: 'Perda de sinal',
  discontinuity: 'Descontinuidade',
  high_impedance: 'Impedância elevada',
  sampling_inconsistency: 'Inconsistência de amostragem',
};

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
