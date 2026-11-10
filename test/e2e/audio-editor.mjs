// End-to-end test of the audio editor, from an untranscribed recording and from a file.
// Usage: npx electron-vite build && node test/e2e/audio-editor.mjs
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createReporter, launchApp, mockOpenDialog, mockSaveDialog, openTool, outputRoot, screenshot } from './harness.mjs';

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
const durationOf = (path) => {
  const [, minutes, seconds] = describe(path).match(/Duration: \d+:(\d+):(\d+\.\d+)/);
  return Number(minutes) * 60 + Number(seconds);
};

const run = Date.now();
const recordings = join(outputRoot, `editor-${run}`, 'Grabaciones');
const folder = join(recordings, '2026-11-10 17.25');
mkdirSync(folder, { recursive: true });

// Twelve seconds in three tones, with the microphone and the PC on separate channels, like a recording.
const tones = '[0:a][1:a][2:a]concat=n=3:v=0:a=1';
const tone = (frequency) => ['-f', 'lavfi', '-i', `sine=frequency=${frequency}:duration=4`];
const tracksPath = join(folder, 'pistas.webm');
const audioPath = join(folder, 'grabacion.mp3');
ffmpeg(...tone(300), ...tone(800), ...tone(1500), '-filter_complex', `${tones},pan=stereo|c0=c0|c1=0.5*c0`, '-c:a', 'libopus', tracksPath);
ffmpeg('-i', tracksPath, '-c:a', 'libmp3lame', '-q:a', '3', audioPath);
const looseFile = join(recordings, '..', 'nota.mp3');
ffmpeg(...tone(300), ...tone(800), ...tone(1500), '-filter_complex', tones, '-c:a', 'libmp3lame', looseFile);

const dataFolder = `data-editor-${run}`;
const library = join(outputRoot, dataFolder, 'library');
mkdirSync(library, { recursive: true });
writeFileSync(
  join(library, 'recording.json'),
  JSON.stringify({ id: 'recording', title: 'Grabación 10 nov, 17:25', kind: 'recording', createdAt: '2026-11-10T20:25:00.000Z', duration: 12, audioPath, tracksPath, folder, source: 'both', status: 'pending', segments: [] }),
);

const report = createReporter();
const { app, page, errors } = await launchApp({ dataFolder, settings: { recordingsFolder: join(recordings, '..') } });

/** Drags across the waveform from one second to another. */
async function selectSeconds(from, to) {
  const box = await page.locator('.waveform-editor').boundingBox();
  const at = (seconds) => box.x + (box.width * seconds) / 12;
  await page.mouse.move(at(from), box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(at(to), box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

try {
  report.step('An untranscribed recording');
  await openTool(page, 'Biblioteca');
  await page.locator('.rows .row').first().click();
  await page.locator('.item-actions .btn', { hasText: /^\s*Audio$/ }).waitFor();
  report.pass('Its audio can be downloaded before transcribing');
  report.check((await page.locator('.item-actions [title="Abrir carpeta"]').count()) === 1, 'Its folder can be opened');
  report.check((await page.locator('.item-actions .btn', { hasText: 'Copiar' }).count()) === 0, 'Transcript actions wait for a transcript');
  const download = join(recordings, '..', 'descargado.mp3');
  await mockSaveDialog(app, download);
  await page.locator('.item-actions .btn', { hasText: /^\s*Audio$/ }).click();
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('Audio guardado'));
  report.check(existsSync(download), 'The download works');

  report.step('Editing it');
  await page.locator('.item-actions .btn', { hasText: 'Editar audio' }).click();
  await page.locator('.waveform-editor').waitFor();
  await screenshot(page, 'audio-editor');
  await selectSeconds(4, 8);
  await page.locator('.btn', { hasText: 'Quitar la selección' }).click();
  const cut = (await page.locator('.editor-cut').innerText()).trim();
  report.check(/^00:0[34] – 00:0[78]$/.test(cut), `Removes the selected part (${cut})`);
  report.check(/00:12 → 00:0[78]/.test(await page.locator('.organize-header .numeric').innerText()), 'Shows how long it ends up');

  const box = await page.locator('.waveform-editor').boundingBox();
  await page.mouse.click(box.x + (box.width * 5.5) / 12, box.y + box.height / 2);
  await page.waitForFunction(() => document.querySelector('.editor-transport .numeric')?.textContent === '00:08');
  report.pass('Jumping into a removed part lands after it');

  await page.locator('.btn', { hasText: 'Deshacer' }).click();
  report.check((await page.locator('.editor-cut').count()) === 0, 'Undo brings it back');
  await page.keyboard.press('Control+z');
  await selectSeconds(4, 8);
  await page.keyboard.press('Delete');
  report.check((await page.locator('.editor-cut').count()) === 1, 'The Delete key removes the selection');
  await screenshot(page, 'audio-editor-cut');

  report.step('Exporting');
  await page.locator('.segmented button', { hasText: 'WAV' }).click();
  await page.locator('.action-bar .btn', { hasText: 'Exportar' }).click();
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('Guardado como grabacion-editado.wav'));
  const exported = join(folder, 'grabacion-editado.wav');
  report.check(Math.abs(durationOf(exported) - 8) < 0.3, `The file lasts what is left (${durationOf(exported).toFixed(2)} s)`);
  report.check(existsSync(audioPath) && Math.abs(durationOf(audioPath) - 12) < 0.3, 'The original is untouched');

  report.step('Saving as a new recording');
  await page.locator('.action-bar .btn-primary', { hasText: 'Guardar como grabación nueva' }).click();
  await page.locator('.title-input').waitFor();
  report.check((await page.locator('.title-input').inputValue()) === 'Grabación 10 nov, 17:25 (editada)', 'Opens the new recording');
  report.check((await page.locator('.btn-primary', { hasText: 'Transcribir ahora' }).count()) === 1, 'Ready to transcribe');
  const edited = readdirSync(library)
    .map((file) => JSON.parse(readFileSync(join(library, file), 'utf8')))
    .find((item) => item.id !== 'recording');
  report.check(edited.folder !== folder && Math.abs(edited.duration - 8) < 0.3, 'In its own folder, with its new length');
  report.check(/stereo/.test(describe(edited.tracksPath)) && Math.abs(durationOf(edited.tracksPath) - 8) < 0.3, 'Its tracks keep both channels, so voices stay apart');
  report.check(Math.abs(durationOf(edited.audioPath) - 8) < 0.3, 'Its audio is edited too');

  report.step('A file of your own');
  await openTool(page, 'Inicio');
  await mockOpenDialog(app, [looseFile]);
  await page.locator('.drop-zone').click();
  await page.locator('.suggestion .btn', { hasText: 'Editar audio' }).click();
  await page.locator('.waveform-editor').waitFor();
  await selectSeconds(0, 4);
  await page.locator('.btn', { hasText: 'Dejar solo la selección' }).click();
  report.check((await page.locator('.action-bar .btn', { hasText: 'Guardar como grabación nueva' }).count()) === 0, 'Without a recording behind it, it only exports');
  await page.locator('.segmented button', { hasText: 'Igual al original' }).click();
  await page.locator('.action-bar .btn', { hasText: 'Exportar' }).click();
  await page.waitForFunction(() => document.querySelector('.toast:last-child')?.textContent.includes('nota-editado.mp3'));
  report.check(Math.abs(durationOf(join(recordings, '..', 'nota-editado.mp3')) - 4) < 0.3, 'Keeping only the selection leaves just that part, in the same format');

  report.step('Converting');
  await page.locator('.page-header + .segmented button', { hasText: 'Convertir' }).click();
  await mockOpenDialog(app, [looseFile]);
  await page.locator('.drop-zone').click();
  await page.locator('.batch-row', { hasText: '00:12' }).waitFor();
  await page.screenshot({ path: join(outputRoot, 'screenshots', 'audio-convert.png'), clip: { x: 272, y: 410, width: 120, height: 100 } });
  await page.locator('.panel .segmented button', { hasText: 'WAV' }).click();
  await page.locator('.action-bar .btn-primary', { hasText: 'Convertir' }).click();
  await page.locator('.batch-row [title="Mostrar en la carpeta"]').waitFor();
  report.check(/Audio: pcm_s16le/.test(describe(join(recordings, '..', 'nota.wav'))), 'Converts audio from the same tool');

  report.step('The menu');
  const groups = await page.locator('.nav-group').evaluateAll((elements) => elements.map((group) => [...group.querySelectorAll('.nav-group-title, .nav-link')].map((item) => item.textContent.trim())));
  console.log('  ', JSON.stringify(groups));
  report.check(JSON.stringify(groups[1]) === JSON.stringify(['Multimedia', 'Video', 'Audio', 'Grabar', 'Transcribir', 'Biblioteca']), 'Video and audio tools live together under Multimedia');

  report.check(errors.length === 0, 'No console errors');
  errors.slice(0, 5).forEach((error) => console.log('   !', error.slice(0, 220)));
} catch (error) {
  report.fail(String(error));
  await screenshot(page, 'audio-editor-failure').catch(() => {});
  errors.slice(0, 5).forEach((entry) => console.log('   !', entry.slice(0, 220)));
} finally {
  await app.close().catch(() => {});
}

report.finish();
