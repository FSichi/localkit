// End-to-end test of the file tools on the real app, checking the files they produce.
// Usage: node test/e2e/tools.mjs   (after `npm run build`)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { PDFDocument, rgb } from 'pdf-lib';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { createReporter, launchApp, mockOpenDialog, mockSaveDialog, openTool, outputRoot, screenshot } from './harness.mjs';

const ffmpegPath = createRequire(import.meta.url)('ffmpeg-static');
const fixtures = join(outputRoot, 'fixtures');
// A fresh folder per run: the tools never overwrite, so old results would change the file names.
const results = join(outputRoot, 'results', String(Date.now()));
mkdirSync(fixtures, { recursive: true });
mkdirSync(results, { recursive: true });

const fixture = (name) => join(fixtures, name);
const ffmpeg = (...args) => execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const probe = (path) => {
  try {
    execFileSync(ffmpegPath, ['-hide_banner', '-i', path], { stdio: 'pipe' });
  } catch (error) {
    return String(error.stderr);
  }
  return '';
};

/** Noisy gradient: photos like this are what really exercises the encoders. */
async function createPhoto(path, width, height) {
  const noise = Buffer.alloc(width * height * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = (i % 256 + Math.random() * 60) & 255;
  await sharp(noise, { raw: { width, height, channels: 3 } }).withExifMerge({ IFD0: { Copyright: 'test' } }).jpeg({ quality: 98 }).toFile(path);
}

async function createPdfWithImages(path, imagePath, pages) {
  const document = await PDFDocument.create();
  const image = await document.embedJpg(readFileSync(imagePath));
  for (let i = 0; i < pages; i++) {
    const page = document.addPage([595, 842]);
    page.drawImage(image, { x: 20, y: 200, width: 555, height: 416 });
    page.drawRectangle({ x: 20, y: 20, width: 100, height: 40, color: rgb(0.2, 0.3, 0.8) });
  }
  writeFileSync(path, await document.save());
}

async function createFixtures() {
  await createPhoto(fixture('photo.jpg'), 2400, 1800);
  await createPhoto(fixture('second.jpg'), 1200, 900);
  await sharp({ create: { width: 800, height: 600, channels: 4, background: { r: 10, g: 120, b: 200, alpha: 0.5 } } }).png().toFile(fixture('flat.png'));
  ffmpeg('-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=8', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:v', 'libx264', '-crf', '12', '-c:a', 'aac', '-b:a', '256k', '-shortest', fixture('clip.mp4'));
  await createPdfWithImages(fixture('doc-a.pdf'), fixture('photo.jpg'), 3);
  await createPdfWithImages(fixture('doc-b.pdf'), fixture('second.jpg'), 2);
}

const { app, page, errors } = await (async () => {
  await createFixtures();
  return launchApp({ dataFolder: 'data-tools', settings: { outputFolder: results } });
})();
const report = createReporter();

const resultFiles = () => readdirSync(results);
const waitForFile = async (path) => {
  for (let attempt = 0; attempt < 120 && !existsSync(path); attempt++) await page.waitForTimeout(500);
};
const waitForBatch = async () => {
  await page.waitForFunction(() => document.querySelector('.action-bar .btn-primary') && !document.querySelector('.batch-row .progress'), null, { timeout: 120000 });
  await page.waitForTimeout(300);
};
const addFiles = async (paths) => {
  await mockOpenDialog(app, paths);
  await page.locator('.drop-zone').click();
  await page.waitForFunction((count) => document.querySelectorAll('.batch-row').length >= count, paths.length);
  await page.waitForFunction(() => ![...document.querySelectorAll('.row-detail')].some((el) => el.textContent.includes('Analizando')));
};
const clearBatch = async () => {
  const clear = page.locator('.action-bar .btn-ghost');
  if (await clear.count()) await clear.click();
};
const runBatch = async () => {
  await page.locator('.action-bar .btn-primary').click();
  await page.waitForTimeout(200);
  await waitForBatch();
};
const selectTab = (label) => page.locator('.segmented button', { hasText: label }).first().click();

try {
  report.step('Home');
  await screenshot(page, '1-home');
  report.check((await page.locator('.tool-card').count()) === 11, 'Shows the eleven tools from the registry');
  await mockOpenDialog(app, [fixture('photo.jpg'), fixture('clip.mp4')]);
  await page.locator('.drop-zone').click();
  await page.waitForSelector('.suggestion');
  await screenshot(page, '2-home-suggestions');
  report.check((await page.locator('.suggestion').count()) === 2, 'Groups dropped files by kind and suggests actions');
  await page.locator('.suggestion .btn', { hasText: 'Optimizar' }).click();
  await page.waitForSelector('.batch-row');
  report.pass('A suggestion opens the tool with the file loaded');

  report.step('Images');
  await addFiles([fixture('photo.jpg'), fixture('second.jpg'), fixture('flat.png')]);
  await page.waitForFunction(() => /→ ~/.test(document.querySelector('.action-bar-text')?.textContent ?? ''));
  report.pass('Shows a size estimate before processing');
  await selectTab('WebP');
  await page.locator('select').first().selectOption('1280');
  await screenshot(page, '3-images');
  await runBatch();
  const webp = await sharp(join(results, 'photo.webp')).metadata();
  report.check(webp.format === 'webp' && webp.width === 1280, `Converted and resized to WebP (${webp.width}x${webp.height})`);
  report.check(statSync(join(results, 'photo.webp')).size < statSync(fixture('photo.jpg')).size / 3, 'The result is much smaller');
  report.check(!(await sharp(join(results, 'photo.webp')).metadata()).exif, 'Metadata was stripped');
  report.check(existsSync(fixture('photo.jpg')), 'The original is untouched');
  await page.locator('.batch-row .btn', { hasText: 'Comparar' }).first().click();
  await page.waitForSelector('.compare img');
  await page.waitForTimeout(600);
  await screenshot(page, '4-images-compare');
  await page.locator('.dialog-actions .btn').click();
  await selectTab('Igual');
  await page.locator('select').first().selectOption('0');
  await runBatch();
  report.check(existsSync(join(results, 'photo-optimizada.jpg')), 'Same-format optimization adds a suffix');
  await runBatch();
  report.check(existsSync(join(results, 'photo-optimizada (2).jpg')), 'Running again never overwrites');
  report.check((await page.locator('.action-bar-text').innerText()).includes('Ahorraste'), 'Shows the total saved');
  await selectTab('JPG');
  await runBatch();
  const flattened = await sharp(join(results, 'flat.jpg')).metadata();
  report.check(flattened.format === 'jpeg' && !flattened.hasAlpha, 'A transparent PNG becomes a flat JPG');
  await clearBatch();

  report.step('Video: compress');
  await openTool(page, 'Video');
  await page.waitForSelector('.segmented');
  await addFiles([fixture('clip.mp4')]);
  await screenshot(page, '5-media');
  await runBatch();
  const compressed = join(results, 'clip-comprimido.mp4');
  report.check(existsSync(compressed) && statSync(compressed).size < statSync(fixture('clip.mp4')).size, `Quality mode reduces the size (${(statSync(fixture('clip.mp4')).size / 1e6).toFixed(1)} → ${(statSync(compressed).size / 1e6).toFixed(1)} MB)`);
  report.check(/Video: h264/.test(probe(compressed)) && /Audio: aac/.test(probe(compressed)), 'The result is a valid H.264 video with audio');
  await page.locator('.segmented button', { hasText: 'Tamaño final' }).click();
  await page.locator('input[type=number]').fill('1');
  await runBatch();
  const targeted = join(results, 'clip-comprimido (2).mp4');
  const targetedMb = statSync(targeted).size / 1e6;
  report.check(targetedMb <= 1.05, `Target size mode lands on 1 MB (${targetedMb.toFixed(2)} MB)`);

  report.step('Video: convert, extract, trim');
  await selectTab('Convertir');
  await selectTab('MKV');
  await runBatch();
  report.check(/Video: h264/.test(probe(join(results, 'clip.mkv'))), 'MKV keeps the stream without re-encoding');
  await selectTab('GIF');
  await runBatch();
  report.check(existsSync(join(results, 'clip.gif')), 'Converts to GIF');
  await selectTab('Extraer audio');
  await runBatch();
  report.check(/Audio: mp3/.test(probe(join(results, 'clip.mp3'))), 'Extracts the audio to MP3');
  await selectTab('Cortar');
  await page.waitForSelector('.trim-player');
  await page.locator('.trim-row input').nth(0).fill('2');
  await page.locator('.trim-row input').nth(1).fill('5');
  await page.waitForTimeout(300);
  await screenshot(page, '6-trim');
  await page.locator('.panel .toggle-row').click();
  await page.locator('.panel .action-bar .btn-primary').click();
  await waitForFile(join(results, 'clip-corte.mp4'));
  const trimmedInfo = probe(join(results, 'clip-corte.mp4')).match(/Duration: 00:00:(\d+\.\d+)/);
  report.check(trimmedInfo && Math.abs(Number(trimmedInfo[1]) - 3) < 0.2, `An exact trim keeps only the selection (${trimmedInfo?.[1]} s)`);
  await selectTab('Comprimir');
  await clearBatch();

  report.step('PDF');
  await openTool(page, 'PDF');
  await addFiles([fixture('doc-a.pdf'), fixture('doc-b.pdf')]);
  await screenshot(page, '7-pdf');
  const merged = join(results, 'merged.pdf');
  await mockSaveDialog(app, merged);
  await page.locator('.batch-row').nth(1).locator('.btn[title="Subir"]').click();
  await page.locator('.action-bar .btn-primary').click();
  await waitForFile(merged);
  const mergedDoc = await PDFDocument.load(readFileSync(merged));
  report.check(mergedDoc.getPageCount() === 5, 'Merges both PDFs in the chosen order (5 pages)');

  await selectTab('Separar');
  await page.locator('input.input').fill('1, 2-3');
  await runBatch();
  report.check((await PDFDocument.load(readFileSync(join(results, 'doc-a-paginas.pdf')))).getPageCount() === 3, 'Extracts the chosen pages');
  await selectTab('Cada página aparte');
  await runBatch();
  report.check(readdirSync(join(results, 'doc-b-paginas')).length === 2, 'Splits every page into its own file');
  await selectTab('Elegir páginas');
  await page.locator('input.input').fill('99');
  await runBatch();
  report.check((await page.locator('.row-detail.danger').first().innerText()).includes('fuera del documento'), 'A bad page range shows a readable error');

  await selectTab('Comprimir');
  await runBatch();
  const pdfCompressed = join(results, 'doc-a-comprimido.pdf');
  report.check(statSync(pdfCompressed).size < statSync(fixture('doc-a.pdf')).size * 0.7, `Compresses embedded images (${(statSync(fixture('doc-a.pdf')).size / 1e6).toFixed(1)} → ${(statSync(pdfCompressed).size / 1e6).toFixed(1)} MB)`);
  report.check((await PDFDocument.load(readFileSync(pdfCompressed))).getPageCount() === 3, 'The compressed PDF keeps its pages');
  await clearBatch();
  await selectTab('Desde imágenes');
  await addFiles([fixture('photo.jpg'), fixture('second.jpg')]);
  const fromImages = join(results, 'from-images.pdf');
  await mockSaveDialog(app, fromImages);
  await page.locator('.action-bar .btn-primary').click();
  await waitForFile(fromImages);
  await page.waitForTimeout(500);
  report.check((await PDFDocument.load(readFileSync(fromImages))).getPageCount() === 2, 'Builds a PDF from images');
  await clearBatch();

  report.step('Passwords');
  await openTool(page, 'Contraseñas');
  await page.waitForSelector('.password-value');
  const first = await page.locator('.password-value').innerText();
  report.check(first.length === 16, 'Generates a 16-character password');
  await page.locator('.password-actions .btn-icon').click();
  report.check((await page.locator('.password-value').innerText()) !== first, 'Generates a different one on demand');
  await page.locator('.password-actions .btn-primary').click();
  await page.waitForSelector('.toast');
  const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
  report.check(copied === (await page.locator('.password-value').innerText()), 'Copies to the system clipboard');
  await screenshot(page, '8-passwords');

  report.step('QR');
  await openTool(page, 'Códigos QR');
  await page.locator('.panel input.input').first().fill('https://codetria.com');
  await page.waitForSelector('.qr-canvas');
  await page.waitForTimeout(300);
  await screenshot(page, '9-qr');
  const png = join(results, 'code.png');
  await mockSaveDialog(app, png);
  await page.locator('.qr-actions .btn-primary').click();
  await waitForFile(png);
  await page.waitForTimeout(300);
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  report.check(decoded?.data === 'https://codetria.com', `The saved QR scans correctly (${decoded?.data})`);

  await selectTab('En lote');
  await page.locator('textarea').fill('A1\nB2\nC3');
  await page.locator('.panel-row input.input').first().fill('https://x.com/{code}');
  const batchFolder = join(results, 'qr-batch');
  mkdirSync(batchFolder, { recursive: true });
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, batchFolder);
  await screenshot(page, '10-qr-batch');
  await page.locator('.action-bar .btn-primary').click();
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('generados'));
  report.check(readdirSync(batchFolder).length === 3, 'Generates a batch into a folder');
  const batchImage = await sharp(join(batchFolder, 'QR_B2.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  report.check(jsQR(new Uint8ClampedArray(batchImage.data), batchImage.info.width, batchImage.info.height)?.data === 'https://x.com/B2', 'Batch codes hold the right content');

  report.step('App');
  await openTool(page, 'Ajustes');
  await page.waitForTimeout(300);
  await screenshot(page, '11-settings');
  await page.locator('.segmented button', { hasText: 'Claro' }).click();
  await page.locator('.nav-link', { hasText: 'Inicio' }).click();
  await page.waitForTimeout(300);
  await screenshot(page, '12-home-light');
  await openTool(page, 'Ajustes');
  await page.locator('.segmented button', { hasText: 'Oscuro' }).click();

  report.check(resultFiles().every((name) => !name.startsWith('.partial')), 'No partial files were left behind');
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
