// End-to-end test of telling voices apart, measuring how much of each conversation lands on the right person.
// Usage: powershell -File test/e2e/make-dialogue.ps1 -Folder test/output/dialogue
//        npx electron-vite build && node test/e2e/voices.mjs test/output/dialogue
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createReporter, launchApp, mockOpenDialog, openTool, outputRoot, screenshot } from './harness.mjs';

const MODEL = 'onnx-community/whisper-base';
const SAMPLE_RATE = 16000;
const PAUSE_SECONDS = 0.9;
/** Higher and lower voices, so the same synthetic voice sounds like three people. */
const PITCH = { A: 1, B: 1.18, C: 0.82 };
/** Share of the speech that has to land on the right person. */
const MIN_ACCURACY = 0.9;

const turnsFolder = process.argv[2];
const ffmpegPath = createRequire(import.meta.url)('ffmpeg-static');
const ffmpeg = (...args) => execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

const folder = join(outputRoot, `voices-${Date.now()}`);
mkdirSync(folder, { recursive: true });

/** Joins the turns with short pauses and remembers who speaks when. */
function buildConversation() {
  const truth = [];
  let start = 0;
  const pieces = readdirSync(turnsFolder)
    .filter((name) => /^turn-\d+-[A-Z]\.wav$/.test(name))
    .sort()
    .map((name) => {
      const voice = name.at(-5);
      const piece = join(folder, `piece-${name}`);
      const pitch = PITCH[voice] === 1 ? '' : `asetrate=22050*${PITCH[voice]},`;
      ffmpeg('-i', join(turnsFolder, name), '-af', `${pitch}aresample=${SAMPLE_RATE},apad=pad_dur=${PAUSE_SECONDS}`, '-ac', '1', '-c:a', 'pcm_s16le', piece);
      const seconds = (statSync(piece).size - 44) / 2 / SAMPLE_RATE;
      truth.push({ voice, start, end: start + seconds - PAUSE_SECONDS });
      start += seconds;
      return piece;
    });
  const list = join(folder, 'list.txt');
  execFileSync('powershell', ['-NoProfile', '-Command', `Set-Content -LiteralPath '${list}' -Encoding ascii -Value @(${pieces.map((piece) => `"file '${piece}'"`).join(',')})`]);
  const clean = join(folder, 'reunion.wav');
  ffmpeg('-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'pcm_s16le', clean);
  // The same conversation the way a call delivers it: heavily compressed.
  const call = join(folder, 'llamada.ogg');
  ffmpeg('-i', clean, '-c:a', 'libopus', '-b:a', '24k', '-ar', '48000', call);
  return { truth, clean, call };
}

/**
 * Share of the transcribed speech on the right person, matching each found voice to the person it mostly is.
 * What Whisper leaves out is a transcription matter, so it doesn't count here.
 */
function accuracy(segments, truth) {
  const overlap = (segment, turn) => Math.max(0, Math.min(segment.end, turn.end) - Math.max(segment.start, turn.start));
  const votes = new Map();
  for (const segment of segments) {
    for (const turn of truth) {
      const key = `${segment.voice}|${turn.voice}`;
      votes.set(key, (votes.get(key) ?? 0) + overlap(segment, turn));
    }
  }
  const found = [...new Set(segments.map(({ voice }) => voice))];
  const people = [...new Set(truth.map(({ voice }) => voice))];
  let right = 0;
  const used = new Set();
  for (const voice of found) {
    const best = people.filter((person) => !used.has(person)).sort((a, b) => (votes.get(`${voice}|${b}`) ?? 0) - (votes.get(`${voice}|${a}`) ?? 0))[0];
    if (!best) continue;
    used.add(best);
    right += votes.get(`${voice}|${best}`) ?? 0;
  }
  const total = segments.reduce((sum, segment) => sum + truth.reduce((covered, turn) => covered + overlap(segment, turn), 0), 0);
  const heard = new Set(truth.filter((turn) => segments.some((segment) => overlap(segment, turn) > 0)).map(({ voice }) => voice));
  return { share: right / total, voices: found.length, heard: heard.size };
}

const { truth, clean, call } = buildConversation();
const dataFolder = 'data-transcription';
const library = join(outputRoot, dataFolder, 'library');
const report = createReporter();
const { app, page, errors } = await launchApp({ dataFolder, settings: { modelId: MODEL, language: 'es', separateVoices: true } });

const latestItem = () =>
  readdirSync(library)
    .map((file) => JSON.parse(readFileSync(join(library, file), 'utf8')))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

async function transcribe(path) {
  await openTool(page, 'Transcribir');
  await mockOpenDialog(app, [path]);
  await page.locator('.drop-zone').click();
  await page.waitForSelector('.job');
  const started = Date.now();
  await page.waitForSelector('.job', { state: 'detached', timeout: 600000 });
  return { item: latestItem(), seconds: (Date.now() - started) / 1000 };
}

try {
  report.step('A clean recording');
  await openTool(page, 'Transcribir');
  report.check(await page.locator('.toggle-row', { hasText: 'Separar voces' }).locator('input').isChecked(), 'The option is on for this test');
  const first = await transcribe(clean);
  const cleanResult = accuracy(first.item.segments, truth);
  report.check(cleanResult.heard === 3 && cleanResult.voices === 3, `Finds the three people (${cleanResult.voices}) in ${first.seconds.toFixed(1)} s`);
  report.check(cleanResult.share >= MIN_ACCURACY, `${(cleanResult.share * 100).toFixed(0)} % of the speech lands on the right person`);

  report.step('Naming the voices');
  await openTool(page, 'Biblioteca');
  await page.locator('.rows .row', { hasText: 'reunion' }).first().click();
  await page.waitForSelector('.transcript');
  report.check((await page.locator('.voice-name').count()) === 3, 'Lists each voice to name it');
  await screenshot(page, 'voices');
  const firstName = page.locator('.voice-name input').first();
  await firstName.fill('Ana');
  await firstName.press('Enter');
  await page.waitForFunction(() => document.querySelector('.transcript .speaker')?.textContent === 'Ana');
  report.pass('The name shows in the transcript');
  report.check(latestItem().voiceNames?.['1'] === 'Ana', 'And it is saved');
  await page.locator('.item-actions .btn-primary').click();
  report.check(/^Ana: /m.test(await app.evaluate(({ clipboard }) => clipboard.readText())), 'Copying uses the name');
  await screenshot(page, 'voices-named');

  report.step('The same conversation over a call');
  const second = await transcribe(call);
  const callResult = accuracy(second.item.segments, truth);
  report.check(callResult.heard === 3 && callResult.voices === 3, `Finds the three people (${callResult.voices})`);
  report.check(callResult.share >= MIN_ACCURACY, `${(callResult.share * 100).toFixed(0)} % of the speech lands on the right person`);

  report.step('With the option off');
  await openTool(page, 'Transcribir');
  await page.locator('.toggle-row', { hasText: 'Separar voces' }).click();
  const third = await transcribe(clean);
  report.check(third.item.segments.every(({ voice }) => voice === undefined), 'Nothing changes from what the app did before');

  report.check(errors.length === 0, 'No console errors');
  errors.slice(0, 5).forEach((error) => console.log('   !', error.slice(0, 220)));
} catch (error) {
  report.fail(String(error));
  await screenshot(page, 'voices-failure').catch(() => {});
  errors.slice(0, 5).forEach((entry) => console.log('   !', entry.slice(0, 220)));
} finally {
  await app.close().catch(() => {});
}

report.finish();
