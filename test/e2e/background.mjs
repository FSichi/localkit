// End-to-end test of working with the window closed, and of quitting in the middle of a transcription.
// Usage: npx electron-vite build && node test/e2e/background.mjs <voice.wav>
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createReporter, launchApp, mockOpenDialog, openTool, outputRoot, root } from './harness.mjs';

const MODEL = 'onnx-community/whisper-base';
const require = createRequire(import.meta.url);
const ffmpeg = (...args) => execFileSync(require('ffmpeg-static'), ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

const folder = join(outputRoot, `background-${Date.now()}`);
mkdirSync(folder, { recursive: true });
// Long enough to still be transcribing when the window closes.
const longAudio = join(folder, 'reunion-larga.wav');
ffmpeg('-stream_loop', '12', '-i', process.argv[2], '-c', 'copy', longAudio);

const dataFolder = 'data-transcription';
const executable = process.env.E2E_EXE;
const report = createReporter();

const exited = (child, milliseconds) =>
  new Promise((resolve) => {
    if (child.exitCode !== null) return resolve(true);
    const timer = setTimeout(() => resolve(false), milliseconds);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });

const windowVisible = (app) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false);
const closeWindow = (app) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());

/** Records the Windows notifications instead of showing them. */
const captureNotifications = (app) =>
  app.evaluate(({ Notification }) => {
    globalThis.notifications = [];
    Notification.prototype.show = function show() {
      globalThis.notifications.push(this.body);
    };
  });
const notifications = (app) => app.evaluate(() => globalThis.notifications);

async function startTranscription(app, page) {
  await openTool(page, 'Transcribir');
  await mockOpenDialog(app, [longAudio]);
  await page.locator('.drop-zone').click();
  await page.waitForFunction(() => /Transcribiendo|%/.test(document.querySelector('.job')?.textContent ?? ''), null, { timeout: 120000 });
}

const latestTitle = () => {
  const library = join(outputRoot, dataFolder, 'library');
  return readdirSync(library)
    .map((file) => JSON.parse(readFileSync(join(library, file), 'utf8')))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
};

// 1. Closing the window while transcribing.
let session = await launchApp({ dataFolder, settings: { modelId: MODEL, language: 'es' } });
try {
  const { app, page, errors } = session;
  report.step('Closing the window while transcribing');
  await captureNotifications(app);
  await startTranscription(app, page);
  const startedAt = new Date().toISOString();
  await closeWindow(app);
  await page.waitForTimeout(500);
  report.check(!(await windowVisible(app)), 'The window goes away');
  report.check((await notifications(app)).some((text) => text.includes('sigue trabajando')), 'Windows tells it keeps working');

  for (let second = 0; second < 300 && !(latestTitle().createdAt > startedAt && latestTitle().status === 'transcribed'); second++) await page.waitForTimeout(1000);
  report.check(latestTitle().title === 'reunion-larga' && latestTitle().status === 'transcribed', 'The transcription finishes in the background');
  await page.waitForTimeout(500);
  report.check((await notifications(app)).some((text) => text.includes('Listo: reunion-larga')), 'And Windows announces it');

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const userData = `--user-data-dir=${join(outputRoot, dataFolder)}`;
  spawn(executable ?? require('electron'), executable ? [userData] : ['.', userData], { cwd: root, env, stdio: 'ignore' });
  for (let attempt = 0; attempt < 20 && !(await windowVisible(app)); attempt++) await page.waitForTimeout(500);
  report.check(await windowVisible(app), 'Opening it again brings the window back');
  const shownBefore = (await notifications(app)).length;
  await openTool(page, 'Contraseñas');
  await page.locator('.btn', { hasText: 'Copiar' }).first().click();
  await page.waitForTimeout(300);
  report.check((await notifications(app)).length === shownBefore, 'With the window on screen, messages stay inside the app');

  report.step('Closing it with nothing to do');
  await closeWindow(app);
  app.disconnect?.();
  report.check(await exited(app.process(), 10000), 'The app closes as always');
  report.check(errors.length === 0, 'No console errors');
} catch (error) {
  report.fail(String(error));
  await session.app.close().catch(() => {});
}

// 2. Always in the background, when chosen.
session = await launchApp({ dataFolder, settings: { modelId: MODEL, language: 'es', keepInBackground: true } });
try {
  const { app, page } = session;
  report.step('With the setting on');
  await closeWindow(app);
  await page.waitForTimeout(500);
  report.check(!(await windowVisible(app)) && app.process().exitCode === null, 'Closing the window keeps it running');

  report.step('Quitting in the middle of a transcription');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await startTranscription(app, page);
  await app.evaluate(({ app: electronApp }) => {
    setTimeout(() => electronApp.quit(), 100);
  });
  app.disconnect?.();
  report.check(await exited(app.process(), 15000), 'It quits cleanly, with no JavaScript error in the way');
  const temp = join(process.env.TEMP, 'localkit');
  report.pass(`Temporary folder after quitting: ${readdirSafe(temp)}`);
} catch (error) {
  report.fail(String(error));
  await session.app.close().catch(() => {});
}

function readdirSafe(path) {
  try {
    return readdirSync(path).length ? 'left for the next launch' : 'empty';
  } catch {
    return 'removed';
  }
}

report.finish();
