// End-to-end test of text extraction with the real engines, on the GPU when there is one.
// Usage: npx electron-vite build && node test/e2e/ocr.mjs
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { createReporter, launchApp, mockOpenDialog, openTool, outputRoot, root, screenshot } from './harness.mjs';

const ENGINE = { tiny: 'PaddlePaddle/PP-OCRv6_tiny', small: 'PaddlePaddle/PP-OCRv6_small', medium: 'PaddlePaddle/PP-OCRv6_medium' };

const LINES = [
  'La reunión de presupuesto se pasó para el miércoles a las diez de la mañana.',
  '¿Quién va a llevar los números del año pasado? Martín dijo que sí, pero',
  'todavía no envió el archivo. ¡Necesitamos revisarlo antes de la presentación!',
];

const svg = (lines, width, height, size) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fff"/><g font-family="Segoe UI" font-size="${size}" fill="#111">${lines
      .map((line, index) => `<text x="${size}" y="${size * 2 + index * size * 1.6}">${line}</text>`)
      .join('')}</g></svg>`,
  );

const run = Date.now();
const folder = join(outputRoot, `ocr-${run}`);
mkdirSync(folder, { recursive: true });

const imagePath = join(folder, 'captura.png');
await sharp(svg(LINES, 900, 170, 17)).png().toFile(imagePath);

/** A scanned document: pictures only, one page stored turned. */
async function createScan(path) {
  const document = await PDFDocument.create();
  const picture = await document.embedPng(await sharp(svg(LINES, 1500, 300, 28)).png().toBuffer());
  const first = document.addPage([750, 150]);
  first.drawImage(picture, { x: 0, y: 0, width: 750, height: 150 });
  writeFileSync(path, await document.save());
}
const scanPath = join(folder, 'escaneo.pdf');
await createScan(scanPath);

/** One page with real text and one scanned. */
const mixedPath = join(folder, 'mixto.pdf');
{
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const digital = document.addPage([600, 200]);
  digital.drawText('Este texto ya viene dentro del documento y no necesita reconocimiento.', { x: 20, y: 150, size: 12, font });
  const picture = await document.embedPng(await sharp(svg(LINES, 1500, 300, 28)).png().toBuffer());
  document.addPage([750, 150]).drawImage(picture, { x: 0, y: 0, width: 750, height: 150 });
  writeFileSync(mixedPath, await document.save());
}

const pdfjs = await import(pathToFileURL(createRequire(join(root, 'package.json')).resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
async function pdfText(path) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), useSystemFonts: true }).promise;
  const pages = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const { items } = await (await pdf.getPage(number)).getTextContent();
    pages.push(items.map((item) => item.str).join(' '));
  }
  return pages;
}

const report = createReporter();
const { app, page, errors } = await launchApp({ dataFolder: 'data-ocr', settings: { ocrModelId: ENGINE.small } });

const addFile = async (path) => {
  await mockOpenDialog(app, [path]);
  await page.locator('.drop-zone').click();
  await page.locator('.batch-row', { hasText: path.split(/[\\/]/).pop() }).waitFor();
};
const clearFiles = async () => {
  while (await page.locator('.batch-row').count()) await page.locator('.batch-row .btn-icon').last().click();
};
const extract = async () => {
  const started = Date.now();
  await page.locator('.btn-primary', { hasText: 'Extraer texto' }).click();
  await page.locator('.batch-row [title="Mostrar en la carpeta"]').first().waitFor({ timeout: 240000 });
  return Date.now() - started;
};

try {
  report.step('An image, downloading the engine the first time');
  await openTool(page, 'Extraer texto');
  await addFile(imagePath);
  await screenshot(page, 'ocr');
  const first = await extract();
  const text = await page.locator('.ocr-text').inputValue();
  console.log('  ', text.replace(/\s+/g, ' ').slice(0, 170));
  report.check(/reunión de presupuesto/.test(text) && /mañana/.test(text), `Reads Spanish with accents (${first} ms)`);
  report.check(text.includes('¿Quién'), 'Reads the opening question mark');
  report.check(text.includes('¡Necesitamos'), 'Restores the opening exclamation mark the engine does not know');
  await screenshot(page, 'ocr-result');
  const textFile = join(folder, 'captura-texto.txt');
  report.check(existsSync(textFile) && readFileSync(textFile, 'utf8').trim() === text, 'Saves a text file');
  await page.locator('.ocr-result-header .btn').click();
  report.check((await app.evaluate(({ clipboard }) => clipboard.readText())) === text, 'Copies the text');

  report.step('Speed with the engine ready');
  await page.locator('.btn-primary', { hasText: 'Extraer texto' }).click();
  const started = Date.now();
  await page.waitForFunction(() => document.querySelector('.batch-row progress, .batch-row [role="progressbar"]') || document.querySelector('.ocr-text'));
  await page.locator('.batch-row [title="Mostrar en la carpeta"]').waitFor({ timeout: 120000 });
  console.log(`   One screenshot takes ${Date.now() - started} ms including loading the engine`);

  report.step('A scanned PDF');
  await clearFiles();
  await addFile(scanPath);
  await page.locator('.segmented button', { hasText: 'PDF buscable' }).click();
  await extract();
  const searchable = join(folder, 'escaneo-buscable.pdf');
  report.check((await pdfText(scanPath))[0].trim() === '', 'The scan started without text');
  const [hidden] = await pdfText(searchable);
  console.log('  ', hidden.slice(0, 150));
  report.check(/presupuesto/.test(hidden) && /miércoles/.test(hidden), 'The new PDF can be searched');
  report.check((await PDFDocument.load(readFileSync(searchable))).getPageCount() === 1, 'And keeps its pages');

  report.step('A PDF that already has text');
  await clearFiles();
  await addFile(mixedPath);
  await page.locator('.segmented button', { hasText: 'Archivo de texto' }).click();
  await extract();
  const mixed = await page.locator('.ocr-text').inputValue();
  report.check(mixed.includes('Este texto ya viene dentro del documento') && /presupuesto/.test(mixed), 'Uses the text it has and reads the scanned page');

  report.step('Choosing the engine');
  for (const [name, id] of [['Rápido', ENGINE.tiny], ['Preciso', ENGINE.medium]]) {
    await clearFiles();
    await addFile(imagePath);
    await page.locator('.panel select').selectOption(id);
    const elapsed = await extract();
    const engineText = await page.locator('.ocr-text').inputValue();
    report.check(/reunión de presupuesto/.test(engineText), `${name} works (${elapsed} ms, downloading it the first time)`);
  }

  report.step('Cancelling');
  await clearFiles();
  await addFile(imagePath);
  await page.locator('.btn-primary', { hasText: 'Extraer texto' }).click();
  await page.locator('.btn', { hasText: 'Cancelar' }).click();
  await page.locator('.btn-primary', { hasText: 'Extraer texto' }).waitFor({ timeout: 20000 });
  report.check((await page.locator('.batch-row .danger').count()) === 0, 'Cancelling is not shown as a failure');

  report.step('Settings');
  await page.locator('.nav-link', { hasText: 'Ajustes' }).click();
  await page.locator('.row-title', { hasText: 'Equilibrado' }).waitFor();
  report.check((await page.locator('input[name="ocr-model"]').count()) === 3, 'The engines are listed with their downloads');

  report.check(errors.length === 0, 'No console errors');
  errors.slice(0, 5).forEach((error) => console.log('   !', error.slice(0, 220)));
} catch (error) {
  report.fail(String(error));
  await screenshot(page, 'ocr-failure').catch(() => {});
  errors.slice(0, 5).forEach((entry) => console.log('   !', entry.slice(0, 220)));
} finally {
  await app.close().catch(() => {});
}

report.finish();
