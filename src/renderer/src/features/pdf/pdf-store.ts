import type { CompressionLevel, PdfPageLayout, PdfSplitMode } from '../../../../shared/jobs.ts';
import { createStore } from '../../lib/create-store.ts';
import { createBatch } from '../file-batch/batch-store.ts';

export type PdfMode = 'merge' | 'split' | 'compress' | 'fromImages';

const PDF_CONCURRENCY = 2;

export const pdfBatch = createBatch(['pdf'], PDF_CONCURRENCY);
export const pdfImagesBatch = createBatch(['image'], 1);

export const pdfOptions = createStore<{
  mode: PdfMode;
  level: CompressionLevel;
  splitMode: PdfSplitMode;
  ranges: string;
  layout: PdfPageLayout;
}>({
  mode: 'merge',
  level: 'medium',
  splitMode: 'ranges',
  ranges: '',
  layout: 'a4',
});

export function setPdfMode(mode: PdfMode) {
  pdfOptions.set({ mode });
  pdfBatch.resetResults();
  pdfImagesBatch.resetResults();
}

export function openPdf(paths: string[], mode: PdfMode) {
  setPdfMode(mode);
  (mode === 'fromImages' ? pdfImagesBatch : pdfBatch).add(paths);
}
