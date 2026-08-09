import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api';
import {
  clearCaptureChunks,
  clearPendingCapture,
  listCaptureChunks,
  loadPendingCapture,
  savePendingCapture,
  storeCaptureChunk,
  type PendingCapture,
} from './liveCaptureStorage';

const PART_SIZE_BYTES = 8 * 1024 * 1024;

export type CapturePhase =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'stopped'
  | 'uploading'
  | 'validating'
  | 'ready'
  | 'error';

interface VideoCaptureDetail {
  id: string;
  session_id: string;
  status: string;
  filename: string;
  mime_type: 'video/webm' | 'video/mp4';
  finalization_job_id: string | null;
  video_asset_id: string | null;
}

interface CompletedPart {
  part_number: number;
  etag: string;
  size_bytes: number;
  checksum_sha256: string;
}

function supportedMimeType(): 'video/webm' {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate))
    ? 'video/webm'
    : 'video/webm';
}

async function sha256(blob: Blob): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Falha inesperada na captura.';
}

export function useLiveCapture(sessionId: string | null) {
  const [phase, setPhase] = useState<CapturePhase>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingCapture | null>(() => loadPendingCapture());
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sequenceRef = useRef(0);
  const writesRef = useRef<Promise<void>[]>([]);

  useEffect(() => () => {
    stream?.getTracks().forEach((track) => track.stop());
  }, [stream]);

  const upload = useCallback(async (capture: PendingCapture) => {
    setPhase('uploading');
    setError(null);
    const chunks = await listCaptureChunks(capture.captureId);
    if (chunks.length === 0) throw new Error('Nenhum fragmento local foi encontrado para retomar.');
    const completeBlob = new Blob(chunks.map((chunk) => chunk.blob), { type: capture.mimeType });
    const partCount = Math.ceil(completeBlob.size / PART_SIZE_BYTES);
    const parts: CompletedPart[] = [];
    for (let index = 0; index < partCount; index += 1) {
      const partNumber = index + 1;
      const part = completeBlob.slice(
        index * PART_SIZE_BYTES,
        Math.min((index + 1) * PART_SIZE_BYTES, completeBlob.size),
        capture.mimeType,
      );
      const signed = await apiClient.post<{ upload_url: string }>(
        `/video-captures/${capture.captureId}/parts/presign`,
        { part_number: partNumber },
      );
      const response = await fetch(signed.upload_url, { method: 'PUT', body: part });
      if (!response.ok) throw new Error(`Falha ao enviar a parte ${partNumber}.`);
      const etag = response.headers.get('ETag');
      if (!etag) throw new Error('O armazenamento não expôs o ETag necessário para concluir o upload.');
      parts.push({
        part_number: partNumber,
        etag,
        size_bytes: part.size,
        checksum_sha256: await sha256(part),
      });
      setProgress(Math.round((partNumber / partCount) * 90));
    }
    const detail = await apiClient.post<VideoCaptureDetail>(
      `/video-captures/${capture.captureId}/complete`,
      {
        parts,
        checksum_sha256: await sha256(completeBlob),
        ended_source_time_us: Math.round(performance.now() * 1000),
      },
    );
    await clearCaptureChunks(capture.captureId);
    clearPendingCapture();
    setPending(null);
    setProgress(100);
    setPhase(detail.status === 'ready' ? 'ready' : 'validating');
    return detail;
  }, []);

  const start = useCallback(async () => {
    if (!sessionId) return;
    setPhase('requesting');
    setError(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      const mimeType = supportedMimeType();
      const startedSourceTimeUs = Math.round(performance.now() * 1000);
      const detail = await apiClient.post<VideoCaptureDetail>(
        `/sessions/${sessionId}/video-captures`,
        {
          filename: `capture-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`,
          mime_type: mimeType,
          camera_constraints: media.getVideoTracks()[0]?.getSettings() ?? {},
          browser_clock: {
            source_clock_id: 'browser-performance',
            time_origin_epoch_us: Math.round(performance.timeOrigin * 1000),
          },
          started_source_time_us: startedSourceTimeUs,
        },
      );
      const capture: PendingCapture = {
        captureId: detail.id,
        sessionId,
        filename: detail.filename,
        mimeType,
        startedSourceTimeUs,
      };
      savePendingCapture(capture);
      setPending(capture);
      setStream(media);
      sequenceRef.current = 0;
      writesRef.current = [];
      const recorder = new MediaRecorder(media, { mimeType });
      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) return;
        const sequence = sequenceRef.current;
        sequenceRef.current += 1;
        writesRef.current.push(storeCaptureChunk({
          captureId: detail.id,
          sequence,
          blob: event.data,
          createdAt: Date.now(),
        }));
      };
      recorderRef.current = recorder;
      recorder.start(1000);
      setPhase('recording');
    } catch (cause) {
      setError(errorMessage(cause));
      setPhase('error');
    }
  }, [sessionId]);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || !pending) return;
    setPhase('stopped');
    await new Promise<void>((resolve) => {
      recorder.addEventListener('stop', () => resolve(), { once: true });
      recorder.stop();
    });
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
    try {
      await Promise.all(writesRef.current);
      await upload(pending);
    } catch (cause) {
      setError(errorMessage(cause));
      setPhase('error');
    }
  }, [pending, stream, upload]);

  const retry = useCallback(async () => {
    const capture = pending ?? loadPendingCapture();
    if (!capture) return;
    try {
      await upload(capture);
    } catch (cause) {
      setError(errorMessage(cause));
      setPhase('error');
    }
  }, [pending, upload]);

  const discard = useCallback(async () => {
    const capture = pending ?? loadPendingCapture();
    if (capture) {
      try {
        await apiClient.post(`/video-captures/${capture.captureId}/abort`);
      } finally {
        await clearCaptureChunks(capture.captureId);
      }
    }
    clearPendingCapture();
    setPending(null);
    setError(null);
    setProgress(0);
    setPhase('idle');
  }, [pending]);

  return { phase, stream, progress, error, pending, start, stop, retry, discard };
}
