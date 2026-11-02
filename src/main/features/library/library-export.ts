// Exports a transcript to TXT, SRT, Markdown or PDF, and copies the audio.
import { BrowserWindow, dialog } from 'electron';
import { copyFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { formatDuration, formatLongDate } from '../../../shared/format.ts';
import { t } from '../../../shared/i18n/index.ts';
import { toHtmlDocument, toMarkdown, toPlainText, toSrt } from '../../../shared/transcript-format.ts';
import type { LibraryItem, TranscriptExportFormat } from '../../../shared/transcription.ts';
import { getItem } from './library-store.ts';

const safeFileName = (title: string) => title.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[<>:"/\\|?*]/g, '-').trim();

async function printToPdf(html: string): Promise<Buffer> {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await window.webContents.printToPDF({ pageSize: 'A4', margins: { top: 0.8, bottom: 0.8, left: 0.85, right: 0.85 } });
  } finally {
    window.destroy();
  }
}

interface TranscriptExporter {
  fileTypeName: string;
  render(item: LibraryItem, title: string, subtitle: string, withTimestamps: boolean): string | Promise<Buffer>;
}

const EXPORTERS: Record<TranscriptExportFormat, TranscriptExporter> = {
  txt: { fileTypeName: t.exportFormats.txt, render: (item, _title, _subtitle, withTimestamps) => toPlainText(item.segments, withTimestamps) },
  srt: { fileTypeName: t.exportFormats.srt, render: (item) => toSrt(item.segments) },
  md: { fileTypeName: t.exportFormats.md, render: (item, title, subtitle, withTimestamps) => toMarkdown(title, subtitle, item.segments, withTimestamps) },
  pdf: { fileTypeName: t.exportFormats.pdf, render: (item, title, subtitle, withTimestamps) => printToPdf(toHtmlDocument(title, subtitle, item.segments, withTimestamps)) },
};

export async function exportTranscript(parent: BrowserWindow, id: string, format: TranscriptExportFormat, withTimestamps: boolean) {
  const item = getItem(id);
  const title = safeFileName(item.title);
  const exporter = EXPORTERS[format];
  const { canceled, filePath } = await dialog.showSaveDialog(parent, {
    defaultPath: `${title}.${format}`,
    filters: [{ name: exporter.fileTypeName, extensions: [format] }],
  });
  if (canceled || !filePath) return null;
  const subtitle = `${formatLongDate(item.createdAt)} · ${formatDuration(item.duration)}`;
  writeFileSync(filePath, await exporter.render(item, title, subtitle, withTimestamps));
  return filePath;
}

export async function exportAudio(parent: BrowserWindow, id: string) {
  const item = getItem(id);
  if (!item.audioPath) return null;
  const extension = extname(item.audioPath).slice(1);
  const { canceled, filePath } = await dialog.showSaveDialog(parent, {
    defaultPath: `${safeFileName(item.title)}.${extension}`,
    filters: [{ name: t.exportFormats.audio, extensions: [extension] }],
  });
  if (canceled || !filePath) return null;
  copyFileSync(item.audioPath, filePath);
  return filePath;
}
