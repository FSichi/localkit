// What every tool needs from the system: file info, dialogs, saving, shell and clipboard.
import { clipboard, ClipboardItem, dialog, shell } from 'electron';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileKindOf, fileNameOf, type FileInfo } from '../../../shared/files.ts';
import { handle, type AppContext } from '../../app/ipc.ts';
import { mediaUrlFor } from '../../app/protocol.ts';
import { PendingOutput } from '../../core/output-files.ts';
import { browserReadablePath, estimateImageBytes, readImageInfo } from '../images/image-processor.ts';
import { probeMedia, videoThumbnail } from '../media/media-probe.ts';
import { readPdfInfo } from '../pdf/pdf-document.ts';

const GITHUB_URL = 'https://github.com/';

async function readMediaInfo(path: string): Promise<Partial<FileInfo>> {
  const media = await probeMedia(path);
  const { videoCodec, audioCodec, duration, width, height } = media;
  return {
    duration,
    width,
    height,
    videoCodec,
    audioCodec,
    // A .webm or .ogg can carry audio only, and the other way around.
    kind: videoCodec ? 'video' : 'audio',
    thumbnail: videoCodec ? await videoThumbnail(path, duration) : undefined,
  };
}

const INFO_READERS: Partial<Record<FileInfo['kind'], (path: string) => Promise<Partial<FileInfo>>>> = {
  image: readImageInfo,
  pdf: readPdfInfo,
  video: readMediaInfo,
  audio: readMediaInfo,
};

async function readFileInfo(path: string): Promise<FileInfo> {
  const info: FileInfo = { path, name: fileNameOf(path), bytes: 0, kind: fileKindOf(path) };
  try {
    info.bytes = statSync(path).size;
    Object.assign(info, await INFO_READERS[info.kind]?.(path));
  } catch (error) {
    console.warn('Could not analyze', path, error);
    info.unreadable = true;
  }
  return info;
}

export function registerFileIpc(context: AppContext) {
  const pickSavePath = async (defaultName: string, extension: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog(context.window(), {
      defaultPath: defaultName,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    });
    return canceled ? null : (filePath ?? null);
  };

  handle('dialog:pickFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(context.window(), { properties: ['openDirectory', 'createDirectory'] });
    return canceled ? null : filePaths[0];
  });
  handle('dialog:pickFiles', async (extensions) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(context.window(), {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '*', extensions }, { name: '*.*', extensions: ['*'] }],
    });
    return canceled ? [] : filePaths;
  });
  handle('dialog:pickSavePath', pickSavePath);

  handle('shell:showItem', (path) => shell.showItemInFolder(normalize(path)));
  handle('shell:openPath', async (path) => {
    await shell.openPath(normalize(path));
  });
  handle('shell:openGitHub', async (url) => {
    if (url.startsWith(GITHUB_URL)) await shell.openExternal(url);
  });

  handle('files:exists', (path) => existsSync(path));
  handle('files:info', readFileInfo);
  handle('files:mediaUrl', (path) => mediaUrlFor(path));
  handle('files:previewUrl', async (path) => mediaUrlFor(await browserReadablePath(path)));
  handle('files:saveAs', async (defaultName, extension, data) => {
    const path = await pickSavePath(defaultName, extension);
    if (path) writeFileSync(path, data);
    return path;
  });
  handle('files:writeToFolder', (folder, name, extension, data) => {
    const output = new PendingOutput({ source: join(folder, name), suffix: '', extension, folder });
    writeFileSync(output.partialPath, data);
    output.commit();
  });

  handle('clipboard:writeText', (text) => clipboard.writeText(text));
  handle('clipboard:writeImage', (dataUrl) => {
    const png = Buffer.from(dataUrl.split(',')[1], 'base64');
    return clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]);
  });

  handle('images:estimate', estimateImageBytes);
}
