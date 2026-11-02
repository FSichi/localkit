// Draws PDF pages, for thumbnails, exporting images and reading scanned documents.
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { AppError } from '../../../../shared/errors.ts';
import { invoke } from '../../lib/bridge.ts';

GlobalWorkerOptions.workerSrc = workerUrl;

const POINTS_PER_INCH = 72;

/** Fonts and decoders the viewer loads on demand, copied by scripts/copy-engine.mjs. */
const assetFolder = (folder: string) => new URL(`engine/lib/pdfjs/${folder}/`, document.baseURI).href;

export async function openPdfDocument(path: string): Promise<PDFDocumentProxy> {
  try {
    return await getDocument({
      url: await invoke('files:mediaUrl', path),
      cMapUrl: assetFolder('cmaps'),
      cMapPacked: true,
      standardFontDataUrl: assetFolder('standard_fonts'),
      wasmUrl: assetFolder('wasm'),
      iccUrl: assetFolder('iccs'),
    }).promise;
  } catch (error) {
    throw new AppError((error as Error).name === 'PasswordException' ? 'pdfEncrypted' : 'pdfUnreadable');
  }
}

/** `rotation` turns the page further from how it is stored, clockwise. */
export async function renderPage(pdf: PDFDocumentProxy, pageNumber: number, pixelsPerInch: number, rotation = 0): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: pixelsPerInch / POINTS_PER_INCH, rotation: page.rotate + rotation });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  page.cleanup();
  return canvas;
}

/** The text a page already carries, one line per entry. Scans have none. */
export async function readPageText(pdf: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const { items } = await page.getTextContent();
  return items
    .map((item) => ('str' in item ? `${item.str}${item.hasEOL ? '\n' : ''}` : ''))
    .join('')
    .trim();
}
