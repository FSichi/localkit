// Reads Markdown files and prints the rendered document to PDF.
import { dialog } from 'electron';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { AppError } from '../../../shared/errors.ts';
import { fileNameOf } from '../../../shared/files.ts';
import { t } from '../../../shared/i18n/index.ts';
import { MARKDOWN_MAX_BYTES, type MarkdownDocument } from '../../../shared/markdown.ts';
import { handle, type AppContext } from '../../app/ipc.ts';
import { printToPdf } from '../../core/print-to-pdf.ts';
import { markdownPrintDocument } from './markdown-print.ts';

function readDocument(path: string): MarkdownDocument {
  let bytes: number;
  try {
    bytes = statSync(path).size;
  } catch {
    throw new AppError('markdownUnreadable');
  }
  if (bytes > MARKDOWN_MAX_BYTES) throw new AppError('markdownTooLarge');
  return { path, name: fileNameOf(path), text: readFileSync(path, 'utf8').replace(/^﻿/, '') };
}

export function registerMarkdownIpc(context: AppContext) {
  handle('markdown:read', readDocument);
  handle('markdown:exportPdf', async (title, body) => {
    const { canceled, filePath } = await dialog.showSaveDialog(context.window(), {
      defaultPath: `${title}.pdf`,
      filters: [{ name: t.exportFormats.pdf, extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return null;
    writeFileSync(filePath, await printToPdf(markdownPrintDocument(title, body)));
    return filePath;
  });
}
