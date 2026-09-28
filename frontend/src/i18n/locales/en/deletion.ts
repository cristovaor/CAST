import type ptDeletion from '../pt-BR/deletion';
import type { Translation } from '../../types';

const deletion = {
  trigger: 'Delete',
  title: {
    project: 'Delete project',
    study: 'Delete study',
    participant: 'Delete participant',
    session: 'Delete session',
    video: 'Delete video',
  },
  warning:
    'Deletion is permanent: the records and the stored files are erased and cannot be recovered. The action is recorded in the audit trail.',
  impactTitle: 'What will be deleted',
  impactLoading: 'Working out the impact…',
  impactError: 'Could not work out the impact: {{message}}',
  storageObjects_one: '{{count}} stored file',
  storageObjects_other: '{{count}} stored files',
  otherRecords_one: '{{count}} other derived record',
  otherRecords_other: '{{count}} other derived records',
  detached_one: '{{count}} record will be kept without the link (e.g. study reports)',
  detached_other: '{{count}} records will be kept without the link (e.g. study reports)',
  activeJobs_one:
    '{{count}} processing job is queued or running. Cancel it or wait for it to finish before deleting.',
  activeJobs_other:
    '{{count}} processing jobs are queued or running. Cancel them or wait for them to finish before deleting.',
  tables: {
    projects: 'Project',
    studies: 'Studies',
    participants: 'Participants',
    sessions: 'Sessions',
    video_assets: 'Videos',
    eeg_assets: 'EEG recordings',
    landmark_artifacts: 'Landmark extractions',
    annotation_events: 'Annotations',
    predictions: 'Predictions',
    processing_jobs: 'Processing jobs',
    analysis_reports: 'Reports',
    consent_terms: 'Consent terms',
  },
  justification: 'Justification',
  justificationHint: 'Required (at least 10 characters). Stored in the audit trail.',
  justificationPlaceholder: 'E.g. participant withdrew consent on 2026-09-28',
  confirmLabel: 'To confirm, type <code>{{phrase}}</code>',
  confirm: 'Delete permanently',
  deleting: 'Deleting…',
  cancel: 'Cancel',
  success: '{{label}} was deleted.',
  noPermission: 'Only administrators can delete this item.',
} satisfies Translation<typeof ptDeletion>;

export default deletion;
