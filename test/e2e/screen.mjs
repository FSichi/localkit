// End-to-end test of screen recording. It records the app's own window, so nothing else on screen
// ends up in the test output, and it really captures the system sound (Windows loopback).
// Usage: npx electron-vite build && node test/e2e/screen.mjs
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { createReporter, launchApp, openTool, outputRoot, screenshot } from './harness.mjs';

const ffmpegPath = createRequire(import.meta.url)('ffmpeg-static');
const ffmpeg = (...args) => execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const describe = (path) => {
  try {
    execFileSync(ffmpegPath, ['-hide_banner', '-i', path], { stdio: 'pipe' });
  } catch (error) {
    return String(error.stderr);
  }
  return '';
};

const RECORD_SECONDS = 4;
const run = Date.now();
const recordings = join(outputRoot, `screen-${run}`);
const recordingsRoot = join(recordings, 'Grabaciones');
mkdirSync(recordingsRoot, { recursive: true });
const settings = { recordingsFolder: recordings, recordingCapture: 'screen', audioSource: 'system', transcribeWhenDone: false };
const dataFolder = `data-screen-${run}`;

const report = createReporter();
let session = await launchApp({ dataFolder, settings });
const { app, page, errors } = session;

const libraryItems = () => {
  const folder = join(outputRoot, dataFolder, 'library');
  return readdirSync(folder).map((file) => JSON.parse(readFileSync(join(folder, file), 'utf8')));
};

try {
  report.step('Choosing what to record');
  await openTool(page, 'Grabar');
  await page.locator('.capture-source').first().waitFor();
  report.check((await page.locator('.capture-source img').first().evaluate((image) => image.naturalWidth)) > 0, 'Sources show a preview');
  const own = page.locator('.capture-source', { hasText: 'LocalKit' });
  await own.first().click();
  report.check((await own.first().getAttribute('aria-checked')) === 'true', 'The app can record a single window');
  // Other windows stay out of the screenshots.
  await page.evaluate(() => document.querySelectorAll('.capture-source:not([aria-checked="true"]) > *').forEach((part) => (part.style.visibility = 'hidden')));
  await screenshot(page, 'screen-setup');

  report.step('Recording');
  await page.locator('.record-button').click();
  await page.waitForSelector('.recording-panel', { timeout: 15000 });
  await page.waitForTimeout(RECORD_SECONDS * 1000);
  await page.locator('.recording-actions .btn-primary').click();
  await page.waitForSelector('.recording-panel', { state: 'detached', timeout: 60000 });
  await page.waitForTimeout(500);

  const [item] = libraryItems();
  report.check(Boolean(item?.videoPath) && existsSync(item.videoPath), 'The library item has its video');
  const video = describe(item.videoPath);
  report.check(/Video: h264/.test(video), `The video is H.264 (${video.match(/Video: .*?(\d{3,}x\d{3,})/)?.[1]})`);
  report.check(/Audio: aac/.test(video), 'It has sound');
  const seconds = Number(video.match(/Duration: 00:00:(\d+\.\d+)/)?.[1]);
  report.check(Math.abs(seconds - RECORD_SECONDS) < 1.5, `It lasts what was recorded (${seconds} s)`);
  const frame = join(recordings, 'frame.png');
  ffmpeg('-ss', '2', '-i', item.videoPath, '-frames:v', '1', frame);
  const { channels } = await sharp(frame).stats();
  report.check(channels[0].stdev > 3, 'The picture is not blank');
  report.check(!existsSync(join(item.folder, 'pantalla.webm')), 'The raw capture was removed');
  report.check(/Audio: opus/.test(describe(item.tracksPath)) && !/Video:/.test(describe(item.tracksPath)), 'The tracks for transcribing are kept as audio only');
  report.check(existsSync(item.audioPath) && statSync(item.audioPath).size > 0, 'The MP3 is there too');

  report.step('In the library');
  await openTool(page, 'Biblioteca');
  await page.locator('.rows .row').first().click();
  await page.locator('.btn', { hasText: 'Abrir video' }).waitFor();
  report.check((await page.locator('.btn', { hasText: 'Agregar subtítulos' }).count()) === 0, 'Subtitles wait until it is transcribed');
  const itemFile = join(outputRoot, dataFolder, 'library', `${item.id}.json`);
  writeFileSync(itemFile, JSON.stringify({ ...item, status: 'transcribed', segments: [{ start: 0, end: 2, text: 'Hola' }] }));
  await openTool(page, 'Biblioteca');
  await page.locator('.rows .row').first().click();
  await page.locator('.btn', { hasText: 'Agregar subtítulos' }).click();
  await page.locator('.batch-row .row-title', { hasText: 'pantalla.mp4' }).waitFor();
  report.pass('The recording offers its video and adding subtitles');

  report.check(errors.length === 0, 'No console errors');
  errors.slice(0, 5).forEach((error) => console.log('   !', error.slice(0, 200)));

  report.step('Audio only still works');
  await openTool(page, 'Grabar');
  await page.locator('.segmented button', { hasText: 'Solo audio' }).click();
  report.check((await page.locator('.capture-source').count()) === 0, 'The picker goes away');
  await page.locator('.record-button').click();
  await page.waitForSelector('.recording-panel', { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.locator('.recording-actions .btn-primary').click();
  await page.waitForSelector('.recording-panel', { state: 'detached', timeout: 30000 });
  await page.waitForTimeout(500);
  const audioOnly = libraryItems().find((candidate) => !candidate.videoPath);
  report.check(Boolean(audioOnly) && !/Video:/.test(describe(audioOnly.tracksPath)), 'An audio recording has no video');
} catch (error) {
  report.fail(String(error));
  await screenshot(page, 'screen-failure').catch(() => {});
  errors.slice(0, 5).forEach((entry) => console.log('   !', entry.slice(0, 200)));
} finally {
  await app.close().catch(() => {});
}

// A recording left open by a crash, in the slower format that has to be converted.
const interrupted = join(recordingsRoot, '2026-11-02 10.00');
mkdirSync(interrupted, { recursive: true });
ffmpeg('-f', 'lavfi', '-i', 'testsrc2=s=641x361:d=2:r=15', '-f', 'lavfi', '-i', 'sine=440:d=2', '-ac', '2', '-c:v', 'libvpx', '-deadline', 'realtime', '-c:a', 'libopus', join(interrupted, 'pantalla.webm'));
writeFileSync(join(interrupted, 'en-curso.json'), JSON.stringify({ source: 'system', capture: 'screen', startedAt: '2026-11-02T13:00:00.000Z' }));

session = await launchApp({ dataFolder, settings, keepSettings: true });
try {
  report.step('Recovering after a crash');
  await session.page.locator('.toast', { hasText: 'Recuperé' }).waitFor({ timeout: 30000 });
  const recovered = libraryItems().find((candidate) => candidate.folder === interrupted);
  report.check(Boolean(recovered?.videoPath), 'The interrupted recording comes back with its video');
  report.check(/Video: h264/.test(describe(recovered.videoPath)), 'A VP8 capture is converted, even with an odd size');
  report.check(!existsSync(join(interrupted, 'en-curso.json')), 'It is not recovered twice');
} catch (error) {
  report.fail(String(error));
} finally {
  await session.app.close().catch(() => {});
}

report.finish();
