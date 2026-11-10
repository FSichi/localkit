// End-to-end test of subtitles in video, with a real transcription of a spoken clip.
// Usage: npx electron-vite build && node test/e2e/subtitles.mjs <voice.wav>
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { createReporter, launchApp, mockOpenDialog, openTool, outputRoot, screenshot } from './harness.mjs';

const MODEL = 'onnx-community/whisper-tiny';
const QUALITY = 'Rápida';
const voice = process.argv[2];

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

const folder = join(outputRoot, `subtitles-${Date.now()}`);
mkdirSync(folder, { recursive: true });
const seededVideo = join(folder, 'seeded.mp4');
const spokenVideo = join(folder, 'spoken.mp4');
const longVideo = join(folder, 'long.mp4');
ffmpeg('-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=4', '-f', 'lavfi', '-i', 'sine=440:d=4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', seededVideo);
ffmpeg('-f', 'lavfi', '-i', 'color=c=0x223355:s=640x360:r=10', '-i', voice, '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', spokenVideo);
ffmpeg('-stream_loop', '30', '-i', spokenVideo, '-c', 'copy', longVideo);

const dataFolder = 'data-transcription';
const library = join(outputRoot, dataFolder, 'library');
mkdirSync(library, { recursive: true });
const seededId = `seeded-${Date.now()}`;
writeFileSync(
  join(library, `${seededId}.json`),
  JSON.stringify({
    id: seededId,
    title: 'Video con transcripción',
    kind: 'file',
    createdAt: new Date().toISOString(),
    duration: 4,
    audioPath: seededVideo,
    language: 'es',
    quality: QUALITY,
    status: 'transcribed',
    segments: [{ start: 0, end: 3.5, text: 'Hola, esto es una prueba de subtítulos con acentos y la letra ñ.' }],
  }),
);

/** Average per-pixel difference between the same area of two frames at one second. */
async function difference(firstVideo, secondVideo, top, height) {
  const frameOf = async (video) => {
    const frame = join(folder, `frame-${Math.random()}.png`);
    ffmpeg('-ss', '1', '-i', video, '-frames:v', '1', frame);
    return sharp(frame).extract({ left: 0, top, width: 640, height }).greyscale().raw().toBuffer();
  };
  const [first, second] = [await frameOf(firstVideo), await frameOf(secondVideo)];
  return first.reduce((total, value, index) => total + Math.abs(value - second[index]), 0) / first.length;
}

const report = createReporter();
const { app, page, errors } = await launchApp({ dataFolder, settings: { modelId: MODEL, language: 'es' } });

const tab = (label) => page.locator('.segmented button', { hasText: label }).click();
const run = () => page.locator('.btn-primary', { hasText: 'Agregar subtítulos' }).click();
const addFile = async (path) => {
  await mockOpenDialog(app, [path]);
  await page.locator('.drop-zone').click();
  await page.waitForFunction(() => document.querySelector('.batch-row .row-detail')?.textContent.includes('×'));
};
const clearFiles = async () => {
  while (await page.locator('.batch-row').count()) await page.locator('.batch-row .btn-icon').last().click();
};
const waitDone = (timeout = 60000) => page.waitForSelector('.batch-row [title="Mostrar en la carpeta"]', { timeout });
const outputs = () => readdirSync(folder).filter((name) => !name.startsWith('frame-'));

try {
  report.step('Burned into the picture, with a transcript from the library');
  await openTool(page, 'Video');
  await tab('Subtítulos');
  await addFile(seededVideo);
  await screenshot(page, 'subtitles');
  await run();
  await waitDone();
  const burned = join(folder, 'seeded-subtitulado.mp4');
  report.check(existsSync(burned), 'Creates the video without touching the original');
  const bottom = await difference(seededVideo, burned, 300, 60);
  const top = await difference(seededVideo, burned, 0, 60);
  report.check(bottom > top * 2 && bottom > 2, `The text is in the lower part of the picture (${top.toFixed(1)} vs ${bottom.toFixed(1)})`);
  report.check(/Audio: aac/.test(describe(burned)), 'Keeps the audio');

  report.step('As a track');
  await tab('Comprimir');
  await tab('Subtítulos');
  await tab('Como pista');
  await run();
  await waitDone();
  const tracked = join(folder, 'seeded-subtitulado (2).mp4');
  report.check(/Subtitle: mov_text/.test(describe(tracked)), 'The MP4 carries a subtitle track');
  const shortMp4 = readFileSync(tracked).length;
  report.check(shortMp4 > 0 && /Video: h264/.test(describe(tracked)), 'The video is copied as is');

  report.step('As a file');
  await tab('Comprimir');
  await tab('Subtítulos');
  await tab('Archivo .srt');
  await run();
  await waitDone();
  const srt = readFileSync(join(folder, 'seeded.srt'), 'utf8');
  report.check(srt.includes('00:00:00,000 --> ') && srt.includes('la letra ñ'), 'Saves an .srt next to the video');
  report.check(srt.split('\n').every((line) => line.length <= 42), 'Long lines are wrapped');

  report.step('Transcribing when there is no transcript');
  await clearFiles();
  await addFile(spokenVideo);
  await page.locator('.segmented button', { hasText: 'Archivo .srt' }).click();
  await run();
  await page.waitForFunction(() => /Preparando|Descargando|Cargando|Transcribiendo|%/.test(document.querySelector('.batch-row .row-detail')?.textContent ?? ''), null, { timeout: 30000 });
  report.pass('The row shows the transcription progress');
  await waitDone(300000);
  const spoken = readFileSync(join(folder, 'spoken.srt'), 'utf8');
  report.check(/\p{L}{4,}/u.test(spoken) && spoken.includes(' --> '), `The speech becomes subtitles: "${spoken.split('\n')[2]}"`);
  await openTool(page, 'Biblioteca');
  await page.locator('.rows .row', { hasText: 'spoken' }).first().waitFor();
  report.pass('The transcript also stays in the library');

  report.step('Reusing that transcript');
  await openTool(page, 'Video');
  await tab('Comprimir');
  await tab('Subtítulos');
  await run();
  const started = Date.now();
  await waitDone();
  report.check(Date.now() - started < 5000 && existsSync(join(folder, 'spoken (2).srt')), 'A video already transcribed does not transcribe again');

  report.step('Cancelling');
  await clearFiles();
  await addFile(longVideo);
  await run();
  await page.waitForFunction(() => /Transcribiendo|%/.test(document.querySelector('.batch-row .row-detail')?.textContent ?? ''), null, { timeout: 60000 });
  const before = outputs().length;
  await page.locator('.btn', { hasText: 'Cancelar' }).click();
  await page.waitForFunction(() => !document.querySelector('.btn-danger, .batch-row progress') && !document.querySelector('.activity-card'), null, { timeout: 15000 });
  report.check(outputs().length === before, 'Cancelling mid-transcription leaves no files');
  report.check((await page.locator('.batch-row .danger').count()) === 0, 'And it is not shown as a failure');

  report.step('From the library');
  await openTool(page, 'Biblioteca');
  await page.locator('.rows .row', { hasText: 'Video con transcripción' }).first().click();
  await page.locator('.btn', { hasText: 'Agregar subtítulos' }).click();
  await page.locator('.batch-row .row-title', { hasText: 'seeded' }).waitFor();
  report.pass('A transcribed video offers adding subtitles');

  report.check(errors.length === 0, 'No console errors');
  errors.slice(0, 5).forEach((error) => console.log('   !', error.slice(0, 200)));
} catch (error) {
  report.fail(String(error));
  await screenshot(page, 'subtitles-failure').catch(() => {});
  errors.slice(0, 5).forEach((entry) => console.log('   !', entry.slice(0, 200)));
} finally {
  await app.close().catch(() => {});
}

report.finish();
