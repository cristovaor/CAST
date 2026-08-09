export interface CastExperimentClientOptions {
  apiBaseUrl: string;
  sessionId: string;
  token: () => string | null;
  sourceClockId?: string;
  flushSize?: number;
}

export type ExperimentEventType =
  | 'trial_started'
  | 'stimulus_presented'
  | 'response'
  | 'interaction'
  | 'environment'
  | 'trial_ended'
  | 'marker';

interface BufferedEvent {
  client_event_id: string;
  trial_id?: string;
  event_type: ExperimentEventType;
  source_time_us: number;
  source_clock_id: string;
  uncertainty_us: number;
  quality_flags: string[];
  valid: boolean;
  payload: Record<string, unknown>;
}

const STORAGE_PREFIX = 'cast-experiment-events:';

export class CastExperimentClient {
  private readonly options: Required<Pick<CastExperimentClientOptions, 'sourceClockId' | 'flushSize'>> & CastExperimentClientOptions;
  private buffer: BufferedEvent[];

  constructor(options: CastExperimentClientOptions) {
    this.options = { sourceClockId: 'browser-performance', flushSize: 50, ...options };
    this.buffer = this.restore();
    window.addEventListener('online', () => { void this.flush(); });
  }

  startTrial(payload: Record<string, unknown> = {}) { return this.record('trial_started', payload); }
  presentStimulus(payload: Record<string, unknown>) { return this.record('stimulus_presented', payload); }
  recordResponse(payload: Record<string, unknown>) { return this.record('response', payload); }
  recordInteraction(payload: Record<string, unknown>) { return this.record('interaction', payload); }
  recordEnvironment(payload: Record<string, unknown>) { return this.record('environment', payload); }
  endTrial(payload: Record<string, unknown> = {}) { return this.record('trial_ended', payload); }

  record(type: ExperimentEventType, payload: Record<string, unknown>) {
    const event: BufferedEvent = {
      client_event_id: crypto.randomUUID(),
      event_type: type,
      source_time_us: Math.round(performance.now() * 1000),
      source_clock_id: this.options.sourceClockId,
      uncertainty_us: 0,
      quality_flags: navigator.onLine ? [] : ['buffered_offline'],
      valid: true,
      payload,
    };
    this.buffer.push(event);
    this.persist();
    if (this.buffer.length >= this.options.flushSize) void this.flush();
    return event.client_event_id;
  }

  async flush(): Promise<number> {
    if (!navigator.onLine || this.buffer.length === 0) return 0;
    const sending = this.buffer.slice();
    const token = this.options.token();
    const response = await fetch(
      `${this.options.apiBaseUrl}/sessions/${this.options.sessionId}/experimental-events/batch`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ events: sending }),
      },
    );
    if (!response.ok) throw new Error(`CAST event flush failed: HTTP ${response.status}`);
    const sentIds = new Set(sending.map((event) => event.client_event_id));
    this.buffer = this.buffer.filter((event) => !sentIds.has(event.client_event_id));
    this.persist();
    return sending.length;
  }

  private storageKey() { return `${STORAGE_PREFIX}${this.options.sessionId}`; }
  private persist() { localStorage.setItem(this.storageKey(), JSON.stringify(this.buffer)); }
  private restore(): BufferedEvent[] {
    try { return JSON.parse(localStorage.getItem(this.storageKey()) ?? '[]') as BufferedEvent[]; }
    catch { return []; }
  }
}
