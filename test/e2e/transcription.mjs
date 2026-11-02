// End-to-end test of transcription, recording and the library on the real app.
// Usage: node test/e2e/transcription.mjs <voice-a.wav> <voice-b.wav> [--maximum]
// Both recording sources are simulated with different files, silently, to check each voice ends
// up on its own track. Real system capture is covered by loopback.mjs.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createReporter, launchApp, mockOpenDialog, mockSaveDialog, openTool, outputRoot, screenshot } from './harness.mjs';

const args = process.argv.slice(2);
const [microphoneAudio, systemAudio] = args.filter((arg) => !arg.startsWith('--'));
const modelId = args.includes('--maximum') ? 'onnx-community/whisper-large-v3-turbo' : 'onnx-community/whisper-base';

const { app, page, errors } = await launchApp({ dataFolder: 'data-transcription', settings: { modelId } });
const report = createReporter();

try {
  report.step('Environment');
  const environment = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    return { gpu: Boolean(adapter), isolated: crossOriginIsolated, url: location.href };
  });
  console.log('  ', environment);
  report.check(environment.gpu, 'WebGPU available');
  report.check(environment.isolated, 'Cross-origin isolation active (threads on CPU)');

  report.step('Transcribe a file');
  await openTool(page, 'Transcribir');
  await mockOpenDialog(app, [microphoneAudio]);
  await page.locator('.drop-zone').click();
  await page.waitForSelector('.job');
  const started = Date.now();
  await page.waitForSelector('.job', { state: 'detached', timeout: 420000 });
  report.pass(`Finished in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  await page.locator('.rows .row').first().click();
  await page.waitForSelector('.transcript');
  const text = await page.locator('.transcript').innerText();
  report.check(/transcribir archivos de audio/i.test(text), 'The transcript has the expected text');

  report.step('Player');
  await page.locator('.paragraph').nth(1).click();
  await page.waitForTimeout(900);
  report.check((await page.locator('.player .numeric').first().innerText()) !== '00:00', 'Jumps and plays from a paragraph');
  report.check((await page.locator('.paragraph.active').count()) === 1, 'Highlights the paragraph being played');
  await page.locator('.player-toggle').click();
  await screenshot(page, 'item');

  report.step('Export and copy');
  const exports = join(outputRoot, 'exports');
  mkdirSync(exports, { recursive: true });
  for (const format of ['txt', 'md', 'pdf', 'srt']) {
    const target = join(exports, `transcript.${format}`);
    await mockSaveDialog(app, target);
    await page.locator('.button-group .btn', { hasText: format.toUpperCase() }).click();
    await page.waitForTimeout(format === 'pdf' ? 2500 : 500);
    report.check(existsSync(target) && statSync(target).size > 50, `${format.toUpperCase()} generated`);
  }
  report.check(readFileSync(join(exports, 'transcript.pdf')).subarray(0, 4).toString() === '%PDF', 'The PDF is valid');
  await page.locator('.item-actions .btn-primary').click();
  await page.waitForTimeout(300);
  report.check(/transcribir archivos/i.test(await app.evaluate(({ clipboard }) => clipboard.readText())), 'Copy puts the text on the clipboard');

  report.step('Record PC and microphone');
  await openTool(page, 'Grabar');
  await page.evaluate(async ([microphone, system]) => {
    const toStream = async (base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const audio = new Audio(URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })));
      audio.muted = true;
      await audio.play();
      return audio.captureStream();
    };
    const microphoneStream = await toStream(microphone);
    const systemStream = await toStream(system);
    navigator.mediaDevices.getUserMedia = async () => microphoneStream;
    navigator.mediaDevices.getDisplayMedia = async () => systemStream;
  }, [readFileSync(microphoneAudio).toString('base64'), readFileSync(systemAudio).toString('base64')]);
  await page.locator('.record-button').click();
  await page.waitForSelector('.recording-panel', { timeout: 15000 });
  await page.waitForTimeout(6000);
  await screenshot(page, 'recording');
  // The shorter clip ends, its track stops and the app saves what it has.
  await page.waitForSelector('.recording-panel', { state: 'detached', timeout: 40000 });
  report.pass('When a source ends, the recording saves itself');
  await page.waitForTimeout(800);
  await openTool(page, 'Transcribir');
  await page.waitForSelector('.job');
  await page.waitForSelector('.job', { state: 'detached', timeout: 300000 });
  await page.locator('.rows .row').first().click();
  await page.waitForSelector('.transcript');
  await page.waitForTimeout(500);
  await screenshot(page, 'recording-transcribed');
  const paragraphs = await page.locator('.paragraph').allInnerTexts();
  paragraphs.forEach((paragraph) => console.log('   ·', paragraph.slice(0, 110).replace(/\s+/g, ' ')));
  const mine = paragraphs.filter((paragraph) => /^(\d\d:\d\d)?Yo/.test(paragraph)).join(' ');
  const theirs = paragraphs.filter((paragraph) => /^(\d\d:\d\d)?Otros/.test(paragraph)).join(' ');
  report.check(/prueba|transcribir/i.test(mine) && !/presupuesto|Discord/i.test(mine), 'The microphone voice is only under "Yo"');
  report.check(/presupuesto|Discord/i.test(theirs) && !/transcribir archivos/i.test(theirs), 'The PC voice is only under "Otros"');
  const recordings = join(outputRoot, 'documents/Grabaciones');
  const latest = join(recordings, readdirSync(recordings).sort().at(-1));
  report.check(existsSync(join(latest, 'grabacion.mp3')), 'The MP3 was generated');
  report.check(!existsSync(join(latest, 'en-curso.json')), 'The recording was closed');

  report.step('Library');
  await openTool(page, 'Biblioteca');
  await page.locator('.search input').fill('Whisper');
  await page.waitForTimeout(500);
  report.check((await page.locator('.row-detail').count()) > 0, 'Search finds spoken content');

  report.check(errors.length === 0, 'No console errors');
  errors.slice(0, 8).forEach((error) => console.log('   !', error.slice(0, 220)));
} catch (error) {
  report.fail(String(error));
  console.error(error);
  await screenshot(page, 'error').catch(() => {});
  errors.slice(0, 8).forEach((entry) => console.log('   !', entry.slice(0, 220)));
} finally {
  await app.close().catch(() => {});
}

report.finish();
