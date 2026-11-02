import type { OcrOutputFormat } from '../../../../shared/jobs.ts';
import { createStore } from '../../lib/create-store.ts';
import { createBatch, type BatchFile, type BatchTask } from '../file-batch/batch-store.ts';
import { stopOcrEngine } from './ocr-engine.ts';
import { readFile } from './ocr-reader.ts';

// One engine and one graphics card: files are read in turn.
const OCR_CONCURRENCY = 1;

export const ocrBatch = createBatch(['image', 'pdf'], OCR_CONCURRENCY);

export const ocrOptions = createStore<{ format: OcrOutputFormat; texts: Record<string, string> }>({ format: 'text', texts: {} });

async function buildRequest(file: BatchFile, task: BatchTask) {
  const { text, pages } = await readFile(file, task);
  const { format, texts } = ocrOptions.get();
  ocrOptions.set({ texts: { ...texts, [file.id]: text } });
  return { type: 'ocr.save' as const, path: file.path, format, text, pages };
}

export async function runOcr() {
  ocrOptions.set({ texts: {} });
  await ocrBatch.run(buildRequest);
  stopOcrEngine();
}

export function openOcr(paths: string[]) {
  ocrBatch.add(paths);
}
