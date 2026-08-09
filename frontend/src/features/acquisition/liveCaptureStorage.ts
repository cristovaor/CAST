const DATABASE_NAME = 'cast-live-capture';
const STORE_NAME = 'chunks';
const DATABASE_VERSION = 1;
const PENDING_KEY = 'cast_live_capture_pending';

export interface StoredCaptureChunk {
  captureId: string;
  sequence: number;
  blob: Blob;
  createdAt: number;
}

export interface PendingCapture {
  captureId: string;
  sessionId: string;
  filename: string;
  mimeType: 'video/webm' | 'video/mp4';
  startedSourceTimeUs: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: ['captureId', 'sequence'],
        });
        store.createIndex('captureId', 'captureId');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeCaptureChunk(chunk: StoredCaptureChunk): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(chunk);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function listCaptureChunks(captureId: string): Promise<StoredCaptureChunk[]> {
  const database = await openDatabase();
  const chunks = await new Promise<StoredCaptureChunk[]>((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .index('captureId')
      .getAll(IDBKeyRange.only(captureId));
    request.onsuccess = () => resolve(request.result as StoredCaptureChunk[]);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return chunks.sort((left, right) => left.sequence - right.sequence);
}

export async function clearCaptureChunks(captureId: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const cursor = store.index('captureId').openKeyCursor(IDBKeyRange.only(captureId));
    cursor.onsuccess = () => {
      const result = cursor.result;
      if (result) {
        store.delete(result.primaryKey);
        result.continue();
      }
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export function savePendingCapture(capture: PendingCapture): void {
  localStorage.setItem(PENDING_KEY, JSON.stringify(capture));
}

export function loadPendingCapture(): PendingCapture | null {
  const serialized = localStorage.getItem(PENDING_KEY);
  if (!serialized) return null;
  try {
    return JSON.parse(serialized) as PendingCapture;
  } catch {
    localStorage.removeItem(PENDING_KEY);
    return null;
  }
}

export function clearPendingCapture(): void {
  localStorage.removeItem(PENDING_KEY);
}
