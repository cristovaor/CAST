import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FlaskConical, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import { apiClient } from '@/lib/api';
import { numeric, parseContextFile, type ImportRow } from './contextImport';

interface Trial { id: string; client_trial_id: string; label: string; started_source_time_us: number; valid: boolean }
type View = 'trial' | 'event' | 'environment';

export function ContextExperimentConsole({ sessionId, open, onOpenChange }: { sessionId: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('trial');
  const [trialLabel, setTrialLabel] = useState('');
  const [trialId, setTrialId] = useState('');
  const [eventType, setEventType] = useState('marker');
  const [eventPayload, setEventPayload] = useState('{}');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [timeColumn, setTimeColumn] = useState('source_time_us');
  const [valueColumn, setValueColumn] = useState('value');
  const [clockColumn, setClockColumn] = useState('');
  const [kind, setKind] = useState('screen_luminance');
  const [unit, setUnit] = useState('cd/m²');
  const [method, setMethod] = useState('sensor/importação pesquisador');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trials = useQuery({
    queryKey: ['experimental-trials', sessionId],
    queryFn: () => apiClient.get<Trial[]>(`/sessions/${sessionId}/trials`),
    enabled: open && Boolean(sessionId),
  });
  const columns = useMemo(() => Object.keys(rows[0] ?? {}), [rows]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(null); setMessage(null);
    try { await operation(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha no contexto experimental.'); }
    finally { setBusy(false); }
  };
  const createTrial = () => run(async () => {
    if (!sessionId || !trialLabel.trim()) return;
    const now = Math.round(performance.now() * 1000);
    const created = await apiClient.post<Trial>(`/sessions/${sessionId}/trials`, {
      client_trial_id: crypto.randomUUID(), label: trialLabel.trim(), source_clock_id: 'browser-performance',
      started_source_time_us: now, uncertainty_us: 1000, quality_flags: [], valid: true, metadata_info: { source: 'context-console' },
    });
    setTrialId(created.id); setTrialLabel(''); setMessage(`Trial “${created.label}” criado.`);
    await queryClient.invalidateQueries({ queryKey: ['experimental-trials', sessionId] });
  });
  const recordEvent = () => run(async () => {
    if (!sessionId) return;
    const payload = JSON.parse(eventPayload) as Record<string, unknown>;
    const now = Math.round(performance.now() * 1000);
    await apiClient.post(`/sessions/${sessionId}/experimental-events/batch`, { events: [{
      client_event_id: crypto.randomUUID(), trial_id: trialId || null, event_type: eventType,
      source_time_us: now, source_clock_id: 'browser-performance', canonical_time_us: null,
      uncertainty_us: 1000, quality_flags: [], valid: true, payload,
    }] });
    setMessage('Evento registrado com idempotência.');
  });
  const importEnvironment = () => run(async () => {
    if (!sessionId || rows.length === 0) return;
    const samples = rows.map((row) => ({
      source_time_us: Math.round(numeric(row[timeColumn], timeColumn)),
      source_clock_id: clockColumn ? String(row[clockColumn] || 'import-clock') : 'import-clock',
      canonical_time_us: null, uncertainty_us: 0, quality_flags: [], valid: true,
      value: numeric(row[valueColumn], valueColumn),
    })).sort((left, right) => left.source_time_us - right.source_time_us);
    await apiClient.post(`/sessions/${sessionId}/environment-series`, {
      kind, unit, method, samples, provenance: { source: 'context-console', imported_rows: rows.length },
    });
    setMessage(`${samples.length} amostras ambientais enviadas para materialização.`);
    setRows([]);
  });
  const loadFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = parseContextFile(await file.text()); setRows(parsed);
      const keys = Object.keys(parsed[0] ?? {});
      setTimeColumn(keys.find((key) => /time|timestamp/i.test(key)) ?? keys[0] ?? '');
      setValueColumn(keys.find((key) => /value|lumin/i.test(key)) ?? keys[1] ?? keys[0] ?? '');
      setClockColumn(keys.find((key) => /clock/i.test(key)) ?? ''); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Arquivo inválido.'); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-border bg-surface text-text-primary">
        <DialogHeader><DialogTitle>Contexto experimental e ambiental</DialogTitle><DialogDescription>Edite trials/eventos ou importe CSV, JSON e JSONL com preview e mapeamento explícito.</DialogDescription></DialogHeader>
        <div className="flex gap-2 border-b border-border pb-3">
          {([['trial','Trials'],['event','Eventos'],['environment','Ambiente']] as const).map(([id,label]) => <button key={id} type="button" onClick={() => setView(id)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === id ? 'bg-primary text-white' : 'bg-surface-muted text-text-secondary'}`}>{label}</button>)}
        </div>
        <div className="min-h-72 space-y-4 py-2">
          {view === 'trial' && <div className="grid gap-4 md:grid-cols-2"><label className="text-xs font-medium">Novo trial<input value={trialLabel} onChange={(event) => setTrialLabel(event.target.value)} placeholder="Ex.: bloco incongruente" className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"/></label><div className="rounded-lg border border-border bg-surface-muted p-3"><p className="text-xs font-semibold">Trials desta sessão</p><ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-text-secondary">{trials.data?.map((trial) => <li key={trial.id}>{trial.label} · {trial.id.slice(0,8)}</li>) ?? <li>Nenhum trial.</li>}</ul></div></div>}
          {view === 'event' && <div className="grid gap-4 md:grid-cols-2"><label className="text-xs font-medium">Trial<select value={trialId} onChange={(event) => setTrialId(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2"><option value="">Sem trial</option>{trials.data?.map((trial) => <option key={trial.id} value={trial.id}>{trial.label}</option>)}</select></label><label className="text-xs font-medium">Tipo<select value={eventType} onChange={(event) => setEventType(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2">{['trial_started','stimulus_presented','response','interaction','environment','trial_ended','marker'].map((type) => <option key={type}>{type}</option>)}</select></label><label className="text-xs font-medium md:col-span-2">Payload JSON<textarea value={eventPayload} onChange={(event) => setEventPayload(event.target.value)} className="mt-1 h-24 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs"/></label></div>}
          {view === 'environment' && <><label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface-muted p-5 text-sm"><Upload size={16}/>Importar CSV, JSON ou JSONL<input type="file" accept=".csv,.json,.jsonl,text/csv,application/json" className="sr-only" onChange={(event) => loadFile(event.target.files?.[0])}/></label>{rows.length > 0 && <><div className="grid gap-3 sm:grid-cols-3"><ColumnSelect label="Tempo (µs)" value={timeColumn} onChange={setTimeColumn} columns={columns}/><ColumnSelect label="Valor" value={valueColumn} onChange={setValueColumn} columns={columns}/><ColumnSelect label="Clock opcional" value={clockColumn} onChange={setClockColumn} columns={['',...columns]}/></div><div className="grid gap-3 sm:grid-cols-3"><label className="text-xs">Série<select value={kind} onChange={(event) => setKind(event.target.value)} className="mt-1 w-full rounded border border-border p-2">{['stimulus_luminance','screen_luminance','face_illumination','ambient_luminance'].map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-xs">Unidade<input value={unit} onChange={(event) => setUnit(event.target.value)} className="mt-1 w-full rounded border border-border p-2"/></label><label className="text-xs">Método<input value={method} onChange={(event) => setMethod(event.target.value)} className="mt-1 w-full rounded border border-border p-2"/></label></div><div className="overflow-auto rounded-lg border border-border"><table className="w-full text-left text-[11px]"><thead><tr>{columns.map((column) => <th key={column} className="bg-surface-muted px-2 py-1.5">{column}</th>)}</tr></thead><tbody>{rows.slice(0,5).map((row,index) => <tr key={index}>{columns.map((column) => <td key={column} className="border-t border-border px-2 py-1.5">{String(row[column] ?? '')}</td>)}</tr>)}</tbody></table></div></>}</>}
          {error && <div className="flex gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700"><AlertTriangle size={15}/>{error}</div>}
          {message && <div className="flex gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 size={15}/>{message}</div>}
        </div>
        <DialogFooter><ActionButton variant="secondary" onClick={() => onOpenChange(false)}>Fechar</ActionButton>{view === 'trial' && <ActionButton variant="primary" disabled={busy || !trialLabel.trim()} onClick={createTrial}><FlaskConical size={15}/>Criar trial</ActionButton>}{view === 'event' && <ActionButton variant="primary" disabled={busy} onClick={recordEvent}>Registrar evento</ActionButton>}{view === 'environment' && <ActionButton variant="primary" disabled={busy || rows.length === 0} onClick={importEnvironment}>Materializar série</ActionButton>}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ColumnSelect({ label, value, onChange, columns }: { label: string; value: string; onChange: (value: string) => void; columns: string[] }) { return <label className="text-xs">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded border border-border p-2">{columns.map((column) => <option key={column} value={column}>{column || '—'}</option>)}</select></label>; }
