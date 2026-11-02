// Real system-sound test, with no simulated devices: plays a voice quietly through the speakers
// and checks the recording captures and transcribes it.
// Usage: node test/e2e/loopback.mjs voice.wav
import { readFileSync } from 'node:fs';
import { launchApp, openTool, screenshot } from './harness.mjs';

const MODEL = 'onnx-community/whisper-base';
const PLAYBACK_VOLUME = 0.2;

const { app, page, errors } = await launchApp({ dataFolder: 'data-transcription', settings: { modelId: MODEL, audioSource: 'system' } });

await openTool(page, 'Grabar');
await page.locator('.record-button').click();
await page.waitForSelector('.recording-panel', { timeout: 15000 });
const duration = await page.evaluate(
  async ([base64, volume]) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const audio = new Audio(URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })));
    audio.volume = volume;
    await audio.play();
    return audio.duration;
  },
  [readFileSync(process.argv[2]).toString('base64'), PLAYBACK_VOLUME],
);
await page.waitForTimeout(duration * 1000 + 800);
await screenshot(page, 'loopback');
await page.locator('.recording-actions .btn-primary').click();
await page.waitForSelector('.recording-panel', { state: 'detached', timeout: 30000 });
await page.waitForTimeout(800);
await openTool(page, 'Transcribir');
await page.waitForSelector('.job', { state: 'detached', timeout: 120000 });
await page.locator('.rows .row').first().click();
await page.waitForSelector('.transcript', { timeout: 10000 });
console.log('Result:', await page.locator('.transcript').innerText());
console.log('Errors:', errors.slice(0, 5));
await app.close();
