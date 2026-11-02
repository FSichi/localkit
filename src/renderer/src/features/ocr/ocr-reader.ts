// Reads a whole file: pages that already carry text use it, and the rest go through the engine.
import { AppError } from '../../../../shared/errors.ts';
import { t } from '../../../../shared/i18n/index.ts';
import { removeStrayCharacters, restoreOpeningExclamations, type OcrPage } from '../../../../shared/ocr.ts';
import { appStore, currentOcrModel } from '../../app/app-store.ts';
import { invoke, on } from '../../lib/bridge.ts';
import type { BatchFile, BatchTask } from '../file-batch/batch-store.ts';
import { openPdfDocument, readPageText, renderPage } from '../pdf/pdf-render.ts';
import { loadOcrModel, recognizeImage, stopOcrEngine, type PagePixels } from './ocr-engine.ts';

/** Enough for small print on an A4 page, without the engine paying for detail it doesn't use. */
const PAGE_PIXELS_PER_INCH = 200;
const MAX_IMAGE_SIDE = 4096;
/** Below this, what a page "has" is a stray page number, not its content. */
const MIN_DIGITAL_CHARACTERS = 40;

export interface FileReading {
  text: string;
  pages: OcrPage[];
}

function canvasPixels(canvas: HTMLCanvasElement | OffscreenCanvas): PagePixels {
  const { width, height } = canvas;
  const context = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  return { width, height, data: context.getImageData(0, 0, width, height).data };
}

async function loadImage(path: string): Promise<PagePixels> {
  const response = await fetch(await invoke('files:previewUrl', path));
  const bitmap = await createImageBitmap(await response.blob());
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvasPixels(canvas);
}

async function ensureModelReady(update: BatchTask['update']) {
  const { profile } = appStore.get();
  const model = currentOcrModel();
  const models = await invoke('models:list', profile);
  if (!models.find(({ id }) => id === model.id)?.downloaded) {
    const unsubscribe = on('models:progress', ({ modelId, doneBytes, totalBytes }) => {
      if (modelId === model.id) update({ fraction: doneBytes / totalBytes, detail: t.ocr.downloading });
    });
    try {
      await invoke('models:download', model.id, profile);
    } finally {
      unsubscribe();
    }
  }
  update({ fraction: 0, detail: t.ocr.loading });
  await loadOcrModel(model, profile);
}

async function readPixels(pixels: PagePixels): Promise<{ text: string; page: OcrPage }> {
  const { width: imageWidth, height: imageHeight } = pixels;
  const { text, lines } = await recognizeImage(pixels);
  return { text, page: { imageWidth, imageHeight, lines } };
}

async function readPdf(path: string, signal: AbortSignal, update: BatchTask['update']): Promise<FileReading> {
  const pdf = await openPdfDocument(path);
  const texts: string[] = [];
  const pages: OcrPage[] = [];
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      signal.throwIfAborted();
      update({ fraction: (number - 1) / pdf.numPages, detail: t.ocr.page(number, pdf.numPages) });
      const digital = await readPageText(pdf, number);
      if (digital.length >= MIN_DIGITAL_CHARACTERS) {
        texts.push(digital);
        pages.push({ imageWidth: 1, imageHeight: 1, lines: [] });
        continue;
      }
      const canvas = await renderPage(pdf, number, PAGE_PIXELS_PER_INCH);
      const { text, page } = await readPixels(canvasPixels(canvas));
      texts.push(text);
      pages.push(page);
    }
  } finally {
    await pdf.loadingTask.destroy();
  }
  return { text: texts.join('\n\n'), pages };
}

export async function readFile(file: BatchFile, { signal, update }: BatchTask): Promise<FileReading> {
  const cancel = () => stopOcrEngine();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    await ensureModelReady(update);
    const reading = file.kind === 'pdf' ? await readPdf(file.path, signal, update) : await readImage(file.path, update);
    return { ...reading, text: restoreOpeningExclamations(removeStrayCharacters(reading.text)).trim() };
  } catch (error) {
    throw signal.aborted ? new AppError('cancelled') : error;
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}

async function readImage(path: string, update: BatchTask['update']): Promise<FileReading> {
  update({ fraction: 0, detail: t.ocr.reading });
  const { text, page } = await readPixels(await loadImage(path));
  return { text, pages: [page] };
}
