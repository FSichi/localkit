// Composition root: wires the app together. Features register themselves here and nothing else.
import { app, dialog, Menu, type BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileKindOf } from '../shared/files.ts';
import { t } from '../shared/i18n/index.ts';
import type { EventContract } from '../shared/ipc.ts';
import { configureCapturePermissions, registerCaptureIpc } from './app/capture-permissions.ts';
import { handle, type AppContext } from './app/ipc.ts';
import { runMigrations } from './app/migrations.ts';
import { registerProtocolHandler, registerSchemePrivileges, serveFolder } from './app/protocol.ts';
import { readSettings, updateSettings } from './app/settings-store.ts';
import { registerUpdaterIpc } from './app/updater.ts';
import { applyNativeTheme, applyWindowTheme, createMainWindow } from './app/window.ts';
import { registerJobsIpc, type JobProcessors } from './core/jobs.ts';
import { removeTempRoot } from './core/temp-files.ts';
import { registerFileIpc } from './features/files/file-service.ts';
import { processImage } from './features/images/image-processor.ts';
import { registerLibraryIpc } from './features/library/library-ipc.ts';
import { registerMarkdownIpc } from './features/markdown/markdown-service.ts';
import { compressVideo, convertMedia, trimMedia } from './features/media/media-jobs.ts';
import { addSubtitles } from './features/media/subtitles-job.ts';
import { compressPdf } from './features/pdf/pdf-compress.ts';
import { saveOcrResult } from './features/ocr/ocr-output.ts';
import { mergePdfs, organizePdf, pdfFromImages, splitPdf } from './features/pdf/pdf-pages.ts';
import { isRecording, registerRecordingIpc } from './features/recording/recording-session.ts';
import { registerPreparationIpc } from './features/transcription/audio-preparation.ts';
import { registerModelIpc } from './features/transcription/model-store.ts';

const JOB_PROCESSORS: JobProcessors = {
  'image.process': processImage,
  'video.compress': compressVideo,
  'media.convert': convertMedia,
  'media.trim': trimMedia,
  'video.subtitles': addSubtitles,
  'pdf.compress': compressPdf,
  'pdf.split': splitPdf,
  'pdf.merge': mergePdfs,
  'pdf.fromImages': pdfFromImages,
  'pdf.organize': organizePdf,
  'ocr.save': saveOcrResult,
};

let mainWindow: BrowserWindow | null = null;

const context: AppContext = {
  window: () => mainWindow!,
  emit: <C extends keyof EventContract>(channel: C, payload: EventContract[C]) => mainWindow?.webContents.send(channel, payload),
};

/** Windows passes the file to open as an argument. */
const fileToOpen = (argv: string[]) => argv.slice(1).find((argument) => fileKindOf(argument) === 'markdown' && existsSync(argument)) ?? null;

/** Closing mid-recording keeps what was recorded, but it should be a decision, not an accident. */
function confirmClose(window: BrowserWindow): boolean {
  if (!isRecording()) return true;
  const response = dialog.showMessageBoxSync(window, {
    type: 'warning',
    title: t.record.closeDialog.title,
    message: t.record.closeDialog.title,
    detail: t.record.closeDialog.detail,
    buttons: [t.record.closeDialog.keep, t.record.closeDialog.close],
    defaultId: 0,
    cancelId: 0,
  });
  return response !== 0;
}

function registerAppIpc() {
  handle('app:bootstrap', () => ({ settings: readSettings(), version: app.getVersion() }));
  handle('app:initialFile', () => fileToOpen(process.argv));
  handle('settings:update', (changes) => {
    const settings = updateSettings(changes);
    if (changes.theme && mainWindow) applyWindowTheme(mainWindow, changes.theme);
    return settings;
  });
}

registerSchemePrivileges();
// On laptops with two GPUs, use the powerful one.
app.commandLine.appendSwitch('force_high_performance_gpu');

if (!app.requestSingleInstanceLock()) app.quit();

app.on('second-instance', (_event, argv) => {
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.focus();
  const file = fileToOpen(argv);
  if (file) context.emit('app:openFile', file);
});

app.whenReady().then(() => {
  runMigrations();
  Menu.setApplicationMenu(null);
  const { theme } = readSettings();
  applyNativeTheme(theme);

  const rendererFolder = join(__dirname, '../renderer');
  serveFolder('app', (relativePath) => ({ root: rendererFolder, path: relativePath || 'index.html' }));
  registerProtocolHandler();
  configureCapturePermissions();

  registerAppIpc();
  registerFileIpc(context);
  registerJobsIpc(context, JOB_PROCESSORS);
  registerModelIpc(context);
  registerPreparationIpc(context);
  registerLibraryIpc(context);
  registerMarkdownIpc(context);
  registerCaptureIpc();
  registerRecordingIpc();
  registerUpdaterIpc(context, isRecording);

  mainWindow = createMainWindow(theme, confirmClose);
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', removeTempRoot);
