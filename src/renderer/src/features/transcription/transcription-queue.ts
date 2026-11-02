// Transcription queue: one job at a time, with progress and cancellation.
import { fileNameOf, withoutExtension } from '../../../../shared/files.ts';
import { AppError } from '../../../../shared/errors.ts';
import { formatDuration } from '../../../../shared/format.ts';
import { t } from '../../../../shared/i18n/index.ts';
import type { AudioSource, LibraryItem, Segment } from '../../../../shared/transcription.ts';
import { findModel } from '../../../../shared/whisper-models.ts';
import { appStore, currentModelId, navigate, touchLibrary } from '../../app/app-store.ts';
import { notify, notifyError } from '../../app/toasts.ts';
import { invoke, on } from '../../lib/bridge.ts';
import { createStore } from '../../lib/create-store.ts';
import { describeError, isCancellation } from '../../lib/errors.ts';
import { isModelLoaded, loadModel, stopEngine, transcribeTrack } from './whisper-engine.ts';

export interface TranscriptionJob {
  id: string;
  title: string;
  path: string;
  source?: AudioSource;
  itemId?: string;
  stage: 'queued' | 'preparing' | 'downloading' | 'loading' | 'transcribing';
  fraction: number | null;
  detail: string;
  partialText: string;
}

/** A tool waiting for a transcript. It handles the outcome, so nothing is announced to the user. */
interface JobWaiter {
  resolve(item: LibraryItem): void;
  reject(error: unknown): void;
  onProgress(job: TranscriptionJob): void;
}

export const transcriptionQueue = createStore<{ jobs: TranscriptionJob[] }>({ jobs: [] });

const waiters = new Map<string, JobWaiter>();
let running = false;
let activeJobId: string | null = null;

function patchJob(id: string, changes: Partial<TranscriptionJob>) {
  transcriptionQueue.set({ jobs: transcriptionQueue.get().jobs.map((job) => (job.id === id ? { ...job, ...changes } : job)) });
  const job = transcriptionQueue.get().jobs.find((candidate) => candidate.id === id);
  if (job) waiters.get(id)?.onProgress(job);
}

function removeJob(id: string) {
  transcriptionQueue.set({ jobs: transcriptionQueue.get().jobs.filter((job) => job.id !== id) });
}

function enqueue(jobs: (Omit<TranscriptionJob, 'id' | 'stage' | 'fraction' | 'detail' | 'partialText'> & { id?: string })[]) {
  const queued = jobs.map((job) => ({ id: crypto.randomUUID(), ...job, stage: 'queued' as const, fraction: null, detail: t.transcribe.stages.queued, partialText: '' }));
  transcriptionQueue.set({ jobs: [...transcriptionQueue.get().jobs, ...queued] });
  processQueue();
}

export function enqueueFiles(paths: string[]) {
  enqueue(paths.map((path) => ({ title: withoutExtension(fileNameOf(path)), path })));
}

export function enqueueLibraryItem(item: { id: string; title: string; tracksPath?: string; audioPath?: string; source?: AudioSource }) {
  const path = item.tracksPath ?? item.audioPath;
  if (path) enqueue([{ title: item.title, path, source: item.tracksPath ? item.source : undefined, itemId: item.id }]);
}

/** Transcribes a file for a tool that needs the result. It still ends up in the library. */
export function transcribeFile(path: string, onProgress: (job: TranscriptionJob) => void, signal: AbortSignal): Promise<LibraryItem> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    waiters.set(id, { resolve, reject, onProgress });
    signal.addEventListener('abort', () => cancelJob(id), { once: true });
    enqueue([{ id, title: withoutExtension(fileNameOf(path)), path }]);
  });
}

export function cancelJob(id: string) {
  if (id !== activeJobId) {
    waiters.get(id)?.reject(new AppError('cancelled'));
    waiters.delete(id);
    return removeJob(id);
  }
  invoke('transcription:cancelPreparation', id);
  invoke('models:cancelDownload', currentModelId());
  stopEngine();
}

async function ensureModelReady(job: TranscriptionJob, modelId: string) {
  const { profile } = appStore.get();
  if (isModelLoaded(modelId)) return;
  const models = await invoke('models:list', profile);
  if (!models.find((model) => model.id === modelId)?.downloaded) {
    patchJob(job.id, { stage: 'downloading', fraction: 0, detail: t.transcribe.stages.downloading(t.models[findModel(modelId).tier].name) });
    const unsubscribe = on('models:progress', (progress) => {
      if (progress.modelId === modelId) patchJob(job.id, { fraction: progress.doneBytes / progress.totalBytes });
    });
    try {
      await invoke('models:download', modelId, profile);
    } finally {
      unsubscribe();
    }
  }
  patchJob(job.id, { stage: 'loading', fraction: null, detail: t.transcribe.stages.loading });
  await loadModel(modelId, profile, (fraction) => patchJob(job.id, { fraction }));
}

async function prepareAudio(job: TranscriptionJob) {
  patchJob(job.id, { stage: 'preparing', fraction: 0, detail: t.transcribe.stages.preparing });
  const unsubscribe = on('transcription:preparationProgress', ({ jobId, fraction }) => {
    if (jobId === job.id) patchJob(job.id, { fraction });
  });
  try {
    return await invoke('transcription:prepare', job.id, job.path, job.source);
  } finally {
    unsubscribe();
  }
}

async function processJob(job: TranscriptionJob) {
  const { language } = appStore.get().settings;
  const modelId = currentModelId();
  const tracks = await prepareAudio(job);
  await ensureModelReady(job, modelId);

  const segments: Segment[] = [];
  const totalDuration = tracks.reduce((total, track) => total + track.duration, 0) || 1;
  let finishedWeight = 0;
  patchJob(job.id, { stage: 'transcribing', fraction: 0, detail: t.transcribe.stages.transcribing });
  for (const track of tracks) {
    const weight = track.duration / totalDuration;
    const trackSegments = await transcribeTrack(track.url, language, track.speaker, ({ fraction, elapsedSeconds, partialText }) => {
      const overall = finishedWeight + fraction * weight;
      const remaining = fraction ? (elapsedSeconds / fraction) * (1 - fraction) : Infinity;
      patchJob(job.id, { fraction: overall, partialText, detail: t.transcribe.progress(Math.round(overall * 100), fraction < 1 ? formatDuration(remaining) : null) });
    });
    segments.push(...trackSegments);
    finishedWeight += weight;
  }
  segments.sort((a, b) => a.start - b.start);

  const result = {
    duration: Math.max(...tracks.map((track) => track.duration)),
    language,
    quality: t.models[findModel(modelId).tier].name,
    status: 'transcribed' as const,
    segments,
  };
  const item = job.itemId
    ? await invoke('library:update', job.itemId, result)
    : await invoke('library:create', { title: job.title, kind: 'file', createdAt: new Date().toISOString(), audioPath: job.path, ...result });

  touchLibrary();
  return item;
}

async function processQueue() {
  if (running) return;
  running = true;
  for (;;) {
    const job = transcriptionQueue.get().jobs.find(({ stage }) => stage === 'queued');
    if (!job) break;
    activeJobId = job.id;
    const waiter = waiters.get(job.id);
    try {
      const item = await processJob(job);
      if (waiter) waiter.resolve(item);
      else notify(t.transcribe.finished(job.title), { action: { label: t.common.open, run: () => navigate({ page: 'item', id: item.id }) } });
    } catch (error) {
      if (waiter) waiter.reject(error);
      else if (isCancellation(error)) notify(t.transcribe.cancelled);
      else {
        console.error(error);
        notifyError(`${job.title}: ${describeError(error)}`);
      }
    }
    waiters.delete(job.id);
    activeJobId = null;
    invoke('transcription:cleanup', job.id);
    removeJob(job.id);
  }
  running = false;
}
