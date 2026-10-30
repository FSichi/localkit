// Exporta una transcripción a TXT, SRT, Markdown o PDF, y copia el audio.
import { BrowserWindow, dialog } from 'electron';
import { copyFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { aHtml, aMd, aSrt, aTxt, duracionLegible } from '../shared/formato.ts';
import { obtenerItem } from './biblioteca.ts';
import type { FormatoExporte, Item } from '../shared/tipos.ts';

const FILTROS: Record<FormatoExporte, { name: string; extensions: string[] }> = {
  txt: { name: 'Texto', extensions: ['txt'] },
  srt: { name: 'Subtítulos', extensions: ['srt'] },
  md: { name: 'Markdown', extensions: ['md'] },
  pdf: { name: 'PDF', extensions: ['pdf'] },
};

const nombreSeguro = (titulo: string) => titulo.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[<>:"/\\|?*]/g, '-').trim();

function subtitulo(item: Item): string {
  const fecha = new Date(item.creado).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short', hour12: false });
  return `${fecha} · ${duracionLegible(item.duracion)}`;
}

async function aPdf(html: string): Promise<Buffer> {
  const ventana = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await ventana.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await ventana.webContents.printToPDF({
      pageSize: 'A4',
      margins: { top: 0.8, bottom: 0.8, left: 0.85, right: 0.85 },
    });
  } finally {
    ventana.destroy();
  }
}

export async function contenidoExporte(item: Item, formato: FormatoExporte, conTiempos: boolean): Promise<string | Buffer> {
  const sub = subtitulo(item);
  const titulo = nombreSeguro(item.titulo);
  if (formato === 'srt') return aSrt(item.segmentos);
  if (formato === 'md') return aMd(titulo, sub, item.segmentos, conTiempos);
  if (formato === 'pdf') return aPdf(aHtml(titulo, sub, item.segmentos, conTiempos));
  return aTxt(item.segmentos, conTiempos);
}

export async function exportarItem(ventana: BrowserWindow, id: string, formato: FormatoExporte, conTiempos: boolean) {
  const item = obtenerItem(id);
  const { canceled, filePath } = await dialog.showSaveDialog(ventana, {
    defaultPath: `${nombreSeguro(item.titulo)}.${formato}`,
    filters: [FILTROS[formato]],
  });
  if (canceled || !filePath) return null;
  writeFileSync(filePath, await contenidoExporte(item, formato, conTiempos));
  return filePath;
}

export async function exportarAudio(ventana: BrowserWindow, id: string) {
  const item = obtenerItem(id);
  if (!item.audio) return null;
  const extension = extname(item.audio).slice(1);
  const { canceled, filePath } = await dialog.showSaveDialog(ventana, {
    defaultPath: `${nombreSeguro(item.titulo)}.${extension}`,
    filters: [{ name: 'Audio', extensions: [extension] }],
  });
  if (canceled || !filePath) return null;
  copyFileSync(item.audio, filePath);
  return filePath;
}
