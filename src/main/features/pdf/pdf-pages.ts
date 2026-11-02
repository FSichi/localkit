// Merge, split and build PDFs from images.
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { PDFDocument, type PDFImage } from 'pdf-lib';
import sharp from 'sharp';
import { t } from '../../../shared/i18n/index.ts';
import type { PdfPageLayout } from '../../../shared/jobs.ts';
import { parsePageRanges } from '../../../shared/page-ranges.ts';
import type { JobProcessor } from '../../core/jobs.ts';
import { PendingOutput } from '../../core/output-files.ts';
import { openPdf } from './pdf-document.ts';

const A4 = { width: 595.28, height: 841.89 };
const A4_MARGIN = 28;
// An image at real size, taken as 150 dpi.
const POINTS_PER_PIXEL = 72 / 150;

async function extractPages(source: PDFDocument, indexes: number[]): Promise<Uint8Array> {
  const target = await PDFDocument.create();
  const pages = await target.copyPages(source, indexes);
  pages.forEach((page) => target.addPage(page));
  return target.save();
}

export const mergePdfs: JobProcessor<'pdf.merge'> = async ({ paths, output }, { reportProgress }) => {
  const merged = await PDFDocument.create();
  let bytesBefore = 0;
  for (const [index, path] of paths.entries()) {
    bytesBefore += statSync(path).size;
    const source = await openPdf(path);
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
    reportProgress((index + 1) / paths.length);
  }
  const bytes = await merged.save();
  writeFileSync(output, bytes);
  return { output, bytesBefore, bytesAfter: bytes.length, fileCount: paths.length };
};

export const splitPdf: JobProcessor<'pdf.split'> = async ({ path, mode, ranges }, { outputFolder, reportProgress }) => {
  const bytesBefore = statSync(path).size;
  const source = await openPdf(path);
  const pageCount = source.getPageCount();

  if (mode === 'ranges') {
    const bytes = await extractPages(source, parsePageRanges(ranges, pageCount));
    const output = new PendingOutput({ source: path, suffix: t.fileSuffixes.pages, extension: 'pdf', folder: outputFolder });
    writeFileSync(output.partialPath, bytes);
    return { output: output.commit(), bytesBefore, bytesAfter: bytes.length, fileCount: 1 };
  }

  const name = basename(path, extname(path));
  const folder = join(outputFolder || dirname(path), `${name}${t.fileSuffixes.pages}`);
  mkdirSync(folder, { recursive: true });
  const digits = String(pageCount).length;
  let bytesAfter = 0;
  for (let index = 0; index < pageCount; index++) {
    const bytes = await extractPages(source, [index]);
    const page = String(index + 1).padStart(digits, '0');
    const output = new PendingOutput({ source: join(folder, name), suffix: `-${page}`, extension: 'pdf', folder });
    writeFileSync(output.partialPath, bytes);
    output.commit();
    bytesAfter += bytes.length;
    reportProgress((index + 1) / pageCount);
  }
  return { output: folder, bytesBefore, bytesAfter, fileCount: pageCount };
};

const PAGE_DRAWERS: Record<PdfPageLayout, (document: PDFDocument, image: PDFImage, width: number, height: number) => void> = {
  imageSize(document, image, width, height) {
    const pageWidth = width * POINTS_PER_PIXEL;
    const pageHeight = height * POINTS_PER_PIXEL;
    document.addPage([pageWidth, pageHeight]).drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
  },
  a4(document, image, width, height) {
    const [pageWidth, pageHeight] = width > height ? [A4.height, A4.width] : [A4.width, A4.height];
    const scale = Math.min((pageWidth - A4_MARGIN * 2) / width, (pageHeight - A4_MARGIN * 2) / height, 1);
    const drawnWidth = width * scale;
    const drawnHeight = height * scale;
    document.addPage([pageWidth, pageHeight]).drawImage(image, {
      x: (pageWidth - drawnWidth) / 2,
      y: (pageHeight - drawnHeight) / 2,
      width: drawnWidth,
      height: drawnHeight,
    });
  },
};

export const pdfFromImages: JobProcessor<'pdf.fromImages'> = async ({ paths, output, layout }, { reportProgress }) => {
  const document = await PDFDocument.create();
  let bytesBefore = 0;
  for (const [index, path] of paths.entries()) {
    bytesBefore += statSync(path).size;
    const { data, info } = await sharp(path, { failOn: 'none' })
      .rotate()
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    PAGE_DRAWERS[layout](document, await document.embedJpg(data), info.width, info.height);
    reportProgress((index + 1) / paths.length);
  }
  const bytes = await document.save();
  writeFileSync(output, bytes);
  return { output, bytesBefore, bytesAfter: bytes.length, fileCount: paths.length };
};
