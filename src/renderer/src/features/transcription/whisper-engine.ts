// Talks to the Whisper worker. One request at a time; the queue above guarantees it.
import { MODELS_BASE_URL } from '../../../../shared/app-scheme.ts';
import { AppError } from '../../../../shared/errors.ts';
import { t } from '../../../../shared/i18n/index.ts';
import type { ComputeProfile, Segment, Speaker } from '../../../../shared/transcription.ts';
import { findModel } from '../../../../shared/whisper-models.ts';

interface PendingRequest {
  resolve: (data: { segments?: Segment[] }) => void;
  reject: (error: Error) => void;
  onEvent?: (data: WorkerEvent) => void;
}

type WorkerEvent =
  | { type: 'done'; segments?: Segment[] }
  | { type: 'error'; message: string }
  | { type: 'loadProgress'; fraction: number }
  | ({ type: 'progress' } & TranscriptionProgress);

export interface TranscriptionProgress {
  fraction: number;
  elapsedSeconds: number;
  partialText: string;
}

let worker: Worker | null = null;
let loadedKey: string | null = null;
let pending: PendingRequest | null = null;
let nextRequestId = 0;

function settle(action: (request: PendingRequest) => void) {
  const request = pending;
  pending = null;
  if (request) action(request);
}

function getWorker(): Worker {
  if (worker) return worker;
  // Relative to the page: the worker lives in public/ and skips the bundler.
  worker = new Worker(new URL('engine/whisper-worker.js', document.baseURI), { type: 'module' });
  worker.addEventListener('message', ({ data }: MessageEvent<WorkerEvent>) => {
    if (data.type === 'done') settle((request) => request.resolve(data));
    else if (data.type === 'error') settle((request) => request.reject(new Error(data.message === 'outOfMemory' ? t.transcribe.outOfMemory : data.message)));
    else pending?.onEvent?.(data);
  });
  worker.addEventListener('error', (event) => {
    settle((request) => request.reject(new Error(event.message)));
  });
  return worker;
}

function request(message: object, onEvent?: (data: WorkerEvent) => void) {
  return new Promise<{ segments?: Segment[] }>((resolve, reject) => {
    pending = { resolve, reject, onEvent };
    getWorker().postMessage({ ...message, id: ++nextRequestId });
  });
}

export function stopEngine() {
  worker?.terminate();
  worker = null;
  loadedKey = null;
  settle((pendingRequest) => pendingRequest.reject(new AppError('cancelled')));
}

export const isModelLoaded = (id: string) => loadedKey?.startsWith(`${id}|`) ?? false;

export async function loadModel(id: string, profile: ComputeProfile, onProgress: (fraction: number) => void) {
  const key = `${id}|${profile}`;
  if (loadedKey === key) return;
  await request({ type: 'load', model: id, profile, dtype: findModel(id).dtype[profile], modelsUrl: MODELS_BASE_URL }, (data) => {
    if (data.type === 'loadProgress') onProgress(data.fraction);
  });
  loadedKey = key;
}

export async function transcribeTrack(url: string, language: string, speaker: Speaker | undefined, onProgress: (progress: TranscriptionProgress) => void) {
  const { segments } = await request({ type: 'transcribe', url, language, speaker }, (data) => {
    if (data.type === 'progress') onProgress(data);
  });
  return segments ?? [];
}
