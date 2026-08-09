import { useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Loader2, Radio, Square } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import { apiClient } from '@/lib/api';

interface LSLStream {
  uid: string;
  name: string;
  type: string;
  source_id: string;
  channel_count: number;
  nominal_srate: number;
}

interface RecordingStart {
  id: string;
  upload_url: string;
}

const AGENT_URL = 'http://127.0.0.1:8765';

export function LSLAcquisitionConsole({ sessionId, open, onOpenChange }: {
  sessionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [token, setToken] = useState('');
  const [streams, setStreams] = useState<LSLStream[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'pairing' | 'ready' | 'recording' | 'processing'>('idle');
  const [error, setError] = useState<string | null>(null);

  const agent = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${AGENT_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
    if (!response.ok) throw new Error(`Agente local: HTTP ${response.status}`);
    return response.json() as Promise<T>;
  };

  const pair = async () => {
    setPhase('pairing'); setError(null);
    try {
      await agent('/health');
      const discovery = await agent<{ streams: LSLStream[] }>('/discovery');
      setStreams(discovery.streams);
      setSelected(discovery.streams.filter((stream) => stream.type.toUpperCase() === 'EEG').slice(0, 1).map((stream) => stream.uid || stream.source_id));
      setPhase('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível parear o agente.');
      setPhase('idle');
    }
  };

  const start = async () => {
    if (!sessionId) return;
    setError(null);
    try {
      const recording = await apiClient.post<RecordingStart>(`/sessions/${sessionId}/lsl-recordings`, {
        agent_id: 'loopback-agent',
        selected_stream_ids: selected,
        browser_clock: { source_clock_id: 'browser-performance', time_origin_epoch_us: Math.round(performance.timeOrigin * 1000) },
      });
      await apiClient.put(`/lsl-recordings/${recording.id}/discovery`, { streams });
      const started = await agent<{ started_source_time_us: number }>('/start', {
        method: 'POST',
        body: JSON.stringify({ recording_id: recording.id, upload_url: recording.upload_url, selected_stream_ids: selected }),
      });
      await apiClient.post(`/lsl-recordings/${recording.id}/started`, started);
      setRecordingId(recording.id); setPhase('recording');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao iniciar LSL.');
    }
  };

  const marker = async () => {
    await agent('/marker', {
      method: 'POST',
      body: JSON.stringify({ client_event_id: crypto.randomUUID(), label: 'CAST marker', source_time_us: Math.round(performance.now() * 1000) }),
    });
  };

  const stop = async () => {
    if (!recordingId) return;
    setError(null);
    try {
      const completed = await agent<{ checksum_sha256: string; size_bytes: number; ended_source_time_us: number }>('/stop', { method: 'POST' });
      await apiClient.post(`/lsl-recordings/${recordingId}/complete`, completed);
      setPhase('processing');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao encerrar LSL.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && phase !== 'recording') onOpenChange(next); }}>
      <DialogContent className="max-w-2xl border-border bg-surface text-text-primary">
        <DialogHeader>
          <DialogTitle>Gravação EEG/LSL</DialogTitle>
          <DialogDescription>O LabRecorder permanece no computador de aquisição; o CAST recebe o XDF imutável somente ao encerrar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block text-xs font-medium text-text-primary">Token de pareamento do agente
            <input type="password" value={token} onChange={(event) => setToken(event.target.value)} disabled={phase === 'recording'} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          </label>
          {streams.length > 0 && (
            <div className="max-h-52 space-y-2 overflow-auto">
              {streams.map((stream) => {
                const id = stream.uid || stream.source_id;
                return <label key={id} className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted p-3 text-xs">
                  <input type="checkbox" checked={selected.includes(id)} disabled={phase === 'recording'} onChange={(event) => setSelected((current) => event.target.checked ? [...current, id] : current.filter((item) => item !== id))} />
                  <Radio size={14} className="text-cyan-600" />
                  <span className="font-semibold">{stream.name}</span>
                  <span className="text-text-muted">{stream.type} · {stream.channel_count} canais · {stream.nominal_srate} Hz</span>
                </label>;
              })}
            </div>
          )}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            EEG é uma medida observada sujeita a artefatos. Sincronização e qualidade continuam exigindo revisão humana.
          </div>
          {error && <div className="flex gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700"><AlertTriangle size={15} />{error}</div>}
          {phase === 'recording' && <div className="flex items-center gap-2 text-sm text-red-600"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />Gravando no LabRecorder local</div>}
          {phase === 'processing' && <div className="flex gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-800"><CheckCircle2 size={15} />XDF confirmado; catálogo, EEG e evidência de sync estão em processamento.</div>}
        </div>
        <DialogFooter>
          {phase === 'idle' && <ActionButton variant="secondary" onClick={pair} disabled={!token}><Activity size={15} />Parear e descobrir</ActionButton>}
          {phase === 'pairing' && <ActionButton variant="secondary" disabled><Loader2 size={15} className="animate-spin" />Descobrindo</ActionButton>}
          {phase === 'ready' && <ActionButton variant="primary" onClick={start} disabled={selected.length === 0}><Radio size={15} />Iniciar LSL</ActionButton>}
          {phase === 'recording' && <><ActionButton variant="secondary" onClick={marker}>Marker</ActionButton><ActionButton variant="danger" onClick={stop}><Square size={14} fill="currentColor" />Parar</ActionButton></>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
