// Talks to the OCR worker. Files are read one at a time, so there is only ever one request.
import { MODELS_BASE_URL } from '../../../../shared/app-scheme.ts';
import { AppError } from '../../../../shared/errors.ts';
import type { OcrLine } from '../../../../shared/ocr.ts';
import type { OcrModel } from '../../../../shared/ocr-models.ts';
import type { ComputeProfile } from '../../../../shared/transcription.ts';

export interface PagePixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface OcrResponse {
  text?: string;
  lines?: OcrLine[];
}

interface PendingRequest {
  resolve: (data: OcrResponse) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
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
  worker = new Worker(new URL('engine/ocr-worker.js', document.baseURI), { type: 'module' });
  worker.addEventListener('message', ({ data }) => {
    if (data.type === 'done') settle((request) => request.resolve(data));
    else settle((request) => request.reject(new Error(data.message)));
  });
  worker.addEventListener('error', (event) => settle((request) => request.reject(new Error(event.message))));
  return worker;
}

function request(message: object, transfer: Transferable[] = []) {
  return new Promise<OcrResponse>((resolve, reject) => {
    pending = { resolve, reject };
    getWorker().postMessage({ ...message, id: ++nextRequestId }, transfer);
  });
}

/** Frees the graphics card once there is nothing left to read, or cancels what is running. */
export function stopOcrEngine() {
  worker?.terminate();
  worker = null;
  settle((pendingRequest) => pendingRequest.reject(new AppError('cancelled')));
}

export async function loadOcrModel({ id, preset }: OcrModel, profile: ComputeProfile) {
  await request({ type: 'load', modelId: id, preset, profile, modelsUrl: MODELS_BASE_URL });
}

export async function recognizeImage({ width, height, data }: PagePixels) {
  const { text, lines } = await request({ type: 'recognize', width, height, data }, [data.buffer]);
  return { text: text ?? '', lines: lines ?? [] };
}
