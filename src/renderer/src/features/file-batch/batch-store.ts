// A tool's file list: files are analyzed on arrival and processed in parallel.
// Every batch tool (images, media, PDF) is an instance of this, with its own request builder.
import { AppError } from '../../../../shared/errors.ts';
import { fileKindOf, fileNameOf, type FileInfo, type FileKind } from '../../../../shared/files.ts';
import { t } from '../../../../shared/i18n/index.ts';
import type { JobProgress, JobRequest, JobResult } from '../../../../shared/jobs.ts';
import { appStore } from '../../app/app-store.ts';
import { notify } from '../../app/toasts.ts';
import { invoke, on } from '../../lib/bridge.ts';
import { createStore } from '../../lib/create-store.ts';
import { describeError, isCancellation } from '../../lib/errors.ts';

export type FileStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface BatchFile extends FileInfo {
  id: string;
  analyzing: boolean;
  status: FileStatus;
  fraction: number;
  /** What is being done, when a file goes through more than one step. */
  detail?: string;
  result?: JobResult;
  errorMessage?: string;
}

/** For requests that take work of their own before the job can start. */
export interface BatchTask {
  signal: AbortSignal;
  update(progress: { fraction: number; detail: string }): void;
}

type RequestBuilder = (file: BatchFile, task: BatchTask) => JobRequest | Promise<JobRequest>;

interface BatchState {
  files: BatchFile[];
  running: boolean;
}

const progressListeners = new Map<string, (fraction: number) => void>();
let subscribed = false;

function subscribeToProgress() {
  if (subscribed) return;
  subscribed = true;
  on('jobs:progress', ({ id, fraction }: JobProgress) => progressListeners.get(id)?.(fraction));
}

function createBatchFile(path: string): BatchFile {
  return { id: crypto.randomUUID(), path, name: fileNameOf(path), bytes: 0, kind: fileKindOf(path), analyzing: true, status: 'pending', fraction: 0 };
}

export function createBatch(acceptedKinds: FileKind[], concurrency: number) {
  const store = createStore<BatchState>({ files: [], running: false });
  let cancelled = false;
  const tasks = new Map<string, AbortController>();

  const patch = (id: string, changes: Partial<BatchFile>) =>
    store.set({ files: store.get().files.map((file) => (file.id === id ? { ...file, ...changes } : file)) });

  function add(paths: string[]) {
    const present = new Set(store.get().files.map((file) => file.path));
    const compatible = paths.filter((path) => acceptedKinds.includes(fileKindOf(path)));
    if (compatible.length < paths.length) notify(t.batch.incompatibleFiles);
    const added = compatible.filter((path) => !present.has(path)).map(createBatchFile);
    if (!added.length) return;
    store.set({ files: [...store.get().files, ...added] });
    for (const file of added) {
      invoke('files:info', file.path).then((info) =>
        patch(file.id, { ...info, analyzing: false, ...(info.unreadable ? { status: 'failed', errorMessage: t.errors.fileUnreadable } : {}) }),
      );
    }
  }

  /** Results belong to the task that made them: switching tasks clears them. */
  const resetResults = () =>
    store.set({ files: store.get().files.map((file) => (file.unreadable ? file : { ...file, status: 'pending', fraction: 0, result: undefined, errorMessage: undefined })) });

  const remove = (id: string) => store.set({ files: store.get().files.filter((file) => file.id !== id) });
  const clear = () => store.set({ files: [] });

  function move(id: string, delta: number) {
    const files = [...store.get().files];
    const from = files.findIndex((file) => file.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= files.length) return;
    [files[from], files[to]] = [files[to], files[from]];
    store.set({ files });
  }

  async function processFile(file: BatchFile, buildRequest: RequestBuilder) {
    patch(file.id, { status: 'processing', fraction: 0, errorMessage: undefined, result: undefined });
    progressListeners.set(file.id, (fraction) => patch(file.id, { fraction }));
    const task = new AbortController();
    tasks.set(file.id, task);
    try {
      const request = await buildRequest(file, { signal: task.signal, update: (progress) => patch(file.id, progress) });
      if (task.signal.aborted) throw new AppError('cancelled');
      const result = await invoke('jobs:run', file.id, request, appStore.get().settings.outputFolder || null);
      patch(file.id, { status: 'done', fraction: 1, detail: undefined, result });
    } catch (error) {
      patch(file.id, { detail: undefined, ...(cancelled || isCancellation(error) ? { status: 'pending', fraction: 0 } : { status: 'failed', errorMessage: describeError(error) }) });
    }
    tasks.delete(file.id);
    progressListeners.delete(file.id);
  }

  async function run(buildRequest: RequestBuilder, onlyIds?: string[]) {
    if (store.get().running) return;
    subscribeToProgress();
    cancelled = false;
    const queue = store.get().files.filter((file) => !file.analyzing && !file.unreadable && (!onlyIds || onlyIds.includes(file.id)));
    store.set({ running: true });
    queue.forEach((file) => patch(file.id, { status: 'pending', fraction: 0, result: undefined, errorMessage: undefined }));
    const worker = async () => {
      for (let file = queue.shift(); file && !cancelled; file = queue.shift()) await processFile(file, buildRequest);
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    store.set({ running: false });
    if (!cancelled) notify(t.batch.finished);
  }

  function cancel() {
    cancelled = true;
    for (const file of store.get().files) {
      if (file.status !== 'processing') continue;
      tasks.get(file.id)?.abort();
      invoke('jobs:cancel', file.id);
    }
  }

  return { ...store, add, remove, clear, move, run, cancel, resetResults };
}

export type Batch = ReturnType<typeof createBatch>;

/** Jobs with one result from several inputs, such as merging PDFs. */
export async function runSingleJob(request: JobRequest, onProgress: (fraction: number) => void): Promise<JobResult> {
  subscribeToProgress();
  const id = crypto.randomUUID();
  progressListeners.set(id, onProgress);
  try {
    return await invoke('jobs:run', id, request, null);
  } finally {
    progressListeners.delete(id);
  }
}
