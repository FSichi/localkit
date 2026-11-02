// Saves what was read: a text file, or a searchable PDF with the text invisible over each page.
import { statSync, writeFileSync } from 'node:fs';
import { degrees, PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import sharp from 'sharp';
import { fileKindOf } from '../../../shared/files.ts';
import { t } from '../../../shared/i18n/index.ts';
import { toPagePlacement, type OcrPage } from '../../../shared/ocr.ts';
import type { JobProcessor } from '../../core/jobs.ts';
import { PendingOutput, withPendingOutput } from '../../core/output-files.ts';
import { openPdf } from '../pdf/pdf-document.ts';

// An image at real size, taken as 150 dpi.
const POINTS_PER_PIXEL = 72 / 150;
const MIN_FONT_SIZE = 1;

/** Standard PDF fonts only cover Western characters. Anything else can't be searched, but the page is still valid. */
const toFontCharacters = (text: string) => text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

function writeHiddenText(page: PDFPage, font: PDFFont, read: OcrPage) {
  const { x, y, width, height } = page.getCropBox();
  const box = { x, y, width, height, rotation: page.getRotation().angle };
  for (const line of read.lines) {
    const text = toFontCharacters(line.text);
    const placement = toPagePlacement(line, read, box);
    // Sized so selecting the text covers the words seen on the page.
    const size = Math.max(MIN_FONT_SIZE, placement.length / font.widthOfTextAtSize(text, 1));
    page.drawText(text, { x: placement.x, y: placement.y, size, font, rotate: degrees(placement.angle), opacity: 0 });
  }
}

async function documentFor(path: string): Promise<PDFDocument> {
  if (fileKindOf(path) === 'pdf') return openPdf(path);
  const { data, info } = await sharp(path, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' }).jpeg({ quality: 90, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const document = await PDFDocument.create();
  const [width, height] = [info.width * POINTS_PER_PIXEL, info.height * POINTS_PER_PIXEL];
  document.addPage([width, height]).drawImage(await document.embedJpg(data), { x: 0, y: 0, width, height });
  return document;
}

export const saveOcrResult: JobProcessor<'ocr.save'> = async ({ path, format, text, pages }, { outputFolder }) => {
  const bytesBefore = statSync(path).size;
  const searchable = format === 'searchablePdf';
  const output = new PendingOutput({
    source: path,
    suffix: searchable ? t.fileSuffixes.searchable : t.fileSuffixes.text,
    extension: searchable ? 'pdf' : 'txt',
    folder: outputFolder,
  });
  return withPendingOutput(output, async () => {
    if (searchable) {
      const document = await documentFor(path);
      const font = await document.embedFont(StandardFonts.Helvetica);
      pages.forEach((read, index) => writeHiddenText(document.getPage(index), font, read));
      writeFileSync(output.partialPath, await document.save());
    } else {
      writeFileSync(output.partialPath, text);
    }
    const bytesAfter = output.partialBytes();
    return { output: output.commit(), bytesBefore, bytesAfter };
  });
};
