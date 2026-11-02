// Opening PDFs and reading their basic data.
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { AppError } from '../../../shared/errors.ts';
import type { FileInfo } from '../../../shared/files.ts';

export async function openPdf(path: string): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(readFileSync(path), { updateMetadata: false });
  } catch (error) {
    throw new AppError(/encrypted/i.test(String(error)) ? 'pdfEncrypted' : 'pdfUnreadable');
  }
}

export async function readPdfInfo(path: string): Promise<Partial<FileInfo>> {
  try {
    const document = await PDFDocument.load(readFileSync(path), { ignoreEncryption: true, updateMetadata: false });
    return { pages: document.getPageCount(), isProtected: document.isEncrypted };
  } catch {
    return { unreadable: true };
  }
}
