// AI models: downloaded from Hugging Face to a real folder, resuming if the network drops.
import { app, net, shell } from 'electron';
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { AppError } from '../../../shared/errors.ts';
import { findDownloadableModel, OCR_MODELS } from '../../../shared/ocr-models.ts';
import type { ComputeProfile, ModelDownloadProgress, ModelState } from '../../../shared/transcription.ts';
import { WHISPER_MODELS } from '../../../shared/whisper-models.ts';
import { handle, type AppContext } from '../../app/ipc.ts';
import { serveFolder } from '../../app/protocol.ts';

const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 1500;
const PROGRESS_STEP_BYTES = 2e6;

function modelsFolder(): string {
  const path = join(app.getPath('userData'), 'models');
  mkdirSync(path, { recursive: true });
  return path;
}

const modelFolder = (id: string) => join(modelsFolder(), ...id.split('/'));

function folderSize(path: string): number {
  if (!existsSync(path)) return 0;
  return readdirSync(path, { withFileTypes: true }).reduce((total, entry) => {
    const child = join(path, entry.name);
    return total + (entry.isDirectory() ? folderSize(child) : statSync(child).size);
  }, 0);
}

function listModels(profile: ComputeProfile): ModelState[] {
  return [...WHISPER_MODELS, ...OCR_MODELS].map((model) => {
    const files = model.files[profile];
    const downloaded = files.length > 0 && files.every((file) => existsSync(join(modelFolder(model.id), file)));
    return { id: model.id, downloaded, bytes: folderSize(modelFolder(model.id)) };
  });
}

async function downloadFile(url: string, target: string, onBytes: (bytes: number) => void, signal: AbortSignal): Promise<void> {
  const partial = `${target}.part`;
  mkdirSync(dirname(target), { recursive: true });
  let resumedBytes = existsSync(partial) ? statSync(partial).size : 0;

  const response = await net.fetch(url, { signal, headers: resumedBytes ? { Range: `bytes=${resumedBytes}-` } : {} });
  if (response.status === 416) {
    // The .part file is complete or invalid: start over.
    rmSync(partial, { force: true });
    return downloadFile(url, target, onBytes, signal);
  }
  if (!response.ok || !response.body) throw new Error(`Hugging Face responded ${response.status}`);
  if (response.status === 200) resumedBytes = 0;
  onBytes(resumedBytes);

  const output = createWriteStream(partial, { flags: resumedBytes ? 'a' : 'w' });
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onBytes(value.byteLength);
      if (!output.write(value)) await new Promise((resolve) => output.once('drain', resolve));
    }
  } finally {
    await new Promise((resolve) => output.end(resolve));
  }
  renameSync(partial, target);
}

const activeDownloads = new Map<string, AbortController>();

async function downloadModel(id: string, profile: ComputeProfile, report: (progress: ModelDownloadProgress) => void) {
  const model = findDownloadableModel(id);
  if (!model) throw new AppError('modelDownloadFailed', id);
  const controller = new AbortController();
  activeDownloads.set(id, controller);
  const pathOf = (file: string) => join(modelFolder(id), file);
  const allFiles = model.files[profile];
  const missing = allFiles.filter((file) => !existsSync(pathOf(file)));
  const totalBytes = model.bytes[profile];
  let doneBytes = allFiles.filter((file) => existsSync(pathOf(file))).reduce((total, file) => total + statSync(pathOf(file)).size, 0);

  let lastReported = 0;
  const onBytes = (bytes: number) => {
    doneBytes += bytes;
    if (doneBytes - lastReported > PROGRESS_STEP_BYTES) {
      lastReported = doneBytes;
      report({ modelId: id, doneBytes: Math.min(doneBytes, totalBytes), totalBytes });
    }
  };

  try {
    for (const file of missing) {
      const url = model.sourceUrl?.(file) ?? `https://huggingface.co/${id}/resolve/main/${file}`;
      for (let attempt = 1; ; attempt++) {
        const bytesBeforeAttempt = doneBytes;
        try {
          await downloadFile(url, pathOf(file), onBytes, controller.signal);
          break;
        } catch (error) {
          if (controller.signal.aborted) throw new AppError('cancelled');
          if (attempt >= MAX_ATTEMPTS) throw new AppError('modelDownloadFailed', String(error));
          // What was downloaded stays in the .part file and is counted again on resume.
          doneBytes = bytesBeforeAttempt;
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
        }
      }
    }
    report({ modelId: id, doneBytes: totalBytes, totalBytes });
  } finally {
    activeDownloads.delete(id);
  }
}

export function registerModelIpc(context: AppContext) {
  serveFolder('models', (relativePath) => {
    const [owner, repository, ...rest] = relativePath.split('/');
    return { root: modelFolder(`${owner}/${repository}`), path: rest.join('/') };
  });
  handle('models:list', listModels);
  handle('models:download', (id, profile) => downloadModel(id, profile, (progress) => context.emit('models:progress', progress)));
  handle('models:cancelDownload', (id) => activeDownloads.get(id)?.abort());
  handle('models:delete', (id) => rmSync(modelFolder(id), { recursive: true, force: true }));
  handle('models:openFolder', async () => {
    await shell.openPath(modelsFolder());
  });
}
