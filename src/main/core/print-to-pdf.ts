// Turns an HTML document into a PDF in a hidden window with scripts disabled.
import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempRoot } from './temp-files.ts';

export async function printToPdf(html: string): Promise<Buffer> {
  // Through a file because long documents don't fit in a URL.
  const page = join(tempRoot(), `${randomUUID()}.html`);
  writeFileSync(page, html);
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await window.loadFile(page);
    return await window.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0.8, bottom: 0.8, left: 0.85, right: 0.85 } });
  } finally {
    window.destroy();
    rmSync(page, { force: true });
  }
}
