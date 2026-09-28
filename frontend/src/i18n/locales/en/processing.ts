import type ptProcessing from '../pt-BR/processing';
import type { Translation } from '../../types';

const processing = {
  job: {
    title: 'Video processing',
    description: 'Track micro-action extraction for video {{id}}',
    cancel: 'Cancel',
    cancelling: 'Cancelling…',
    backToVideo: 'Back to video',
    connectionError: 'Connection error',
    cancelFailed: 'The job could not be cancelled: {{message}}',
    extractionStatus: 'Extraction status',
    logs: 'Execution logs',
    logsJob: 'Execution logs (Job: {{id}})',
    waitingLogs: 'Waiting for logs...',
    streamFailed: 'Lost track of the processing job. Please try again.',
  },
  queue: {
    title: 'Processing pipeline',
    description: 'Monitor jobs, quality and throughput of the micro-action analysis pipeline.',
    retryAllTitle: 'Reprocess every real failed job',
    retryAllUnavailable: 'Available when there are real failed jobs',
    retryAll: 'Reprocess failures',
    retrying: 'Reprocessing…',
    kpis: {
      queued: { label: 'Queued', description: 'Jobs waiting for an available worker' },
      running: { label: 'Running', description: 'Jobs being processed right now' },
      succeeded: { label: 'Completed (24h)', description: 'Finished successfully in the last 24h' },
      failed: { label: 'Failed (24h)', description: 'Errors that need action' },
      avgTime: { label: 'Average time', description: 'Average duration of finished jobs' },
      total: { label: 'Total', description: 'Jobs visible in this organisation' },
    },
    tabs: {
      label: 'Filter jobs by status',
      all: 'All',
      queued: 'Queued',
      running: 'Running',
      succeeded: 'Completed',
      failed: 'Failed',
    },
    searchPlaceholder: 'Search by job, video, study, step or worker...',
    resultSingular: 'job',
    resultPlural: 'jobs',
    columns: {
      id: 'Job ID',
      video: 'Video',
      study: 'Study',
      status: 'Status',
      progress: 'Progress',
      step: 'Current step',
      worker: 'Worker',
      time: 'Time',
    },
    actions: {
      details: 'View details',
      retry: 'Reprocess',
      cancel: 'Cancel',
    },
    feedback: {
      illustrative: 'This item is illustrative. The action becomes available once the queue processes real jobs.',
      retried: 'Job {{id}} resubmitted for processing.',
      cancelled: 'Cancellation requested for job {{id}}.',
      retryFailed: 'Reprocessing failed: {{message}}',
      cancelFailed: 'Cancellation failed: {{message}}',
      retriedAll: '{{succeeded}} of {{total}} job(s) resubmitted for processing.',
    },
    empty: {
      loading: 'Loading jobs…',
      error: 'The queue could not be loaded',
      none: 'No jobs in this category',
    },
  },
  toasts: {
    cancelled: 'Job cancelled',
    requeued: 'Job requeued',
    requeuedDetail: 'Processing will resume shortly.',
  },
} satisfies Translation<typeof ptProcessing>;

export default processing;
