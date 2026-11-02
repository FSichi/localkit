// End-to-end test of the PDF page editor, checking the files it produces.
// Usage: npx electron-vite build && node test/e2e/organize-pdf.mjs
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { createReporter, launchApp, mockOpenDialog, mockSaveDialog, openTool, outputRoot, screenshot } from './harness.mjs';

const folder = join(outputRoot, `organize-${Date.now()}`);
mkdirSync(folder, { recursive: true });

const COLORS = [rgb(0.9, 0.2, 0.2), rgb(0.2, 0.7, 0.3), rgb(0.2, 0.3, 0.9), rgb(0.9, 0.8, 0.1)];
const source = await PDFDocument.create();
const font = await source.embedFont(StandardFonts.Helvetica);
COLORS.forEach((color, index) => {
  const page = source.addPage([300, 400]);
  page.drawRectangle({ x: 0, y: 0, width: 300, height: 400, color });
  page.drawText(`Pagina ${index + 1}`, { x: 40, y: 200, size: 30, font });
});
const pdfPath = join(folder, 'documento.pdf');
writeFileSync(pdfPath, await source.save());
const protectedPath = join(folder, 'dañado.pdf');
writeFileSync(protectedPath, 'esto no es un PDF');

const report = createReporter();
const { app, page, errors } = await launchApp({ dataFolder: `data-organize-${Date.now()}` });
const card = (number) => page.locator(`.page-card[data-page="${number}"]`);
const order = () => page.locator('.page-card').evaluateAll((cards) => cards.map((element) => Number(element.dataset.page)));

try {
  report.step('Opening');
  await openTool(page, 'PDF');
  await page.locator('.segmented button', { hasText: 'Organizar' }).click();
  await mockOpenDialog(app, [protectedPath]);
  await page.locator('.drop-zone').click();
  await page.waitForFunction(() => document.querySelector('.toast.error')?.textContent.includes('No se pudo leer'));
  report.pass('A damaged PDF shows a readable error');

  await mockOpenDialog(app, [pdfPath]);
  await page.locator('.drop-zone').click();
  await page.locator('.page-card').first().waitFor();
  report.check((await page.locator('.page-card').count()) === 4, 'Shows one card per page');
  await page.waitForFunction(() => [...document.querySelectorAll('.page-thumbnail img')].filter((image) => image.naturalWidth > 0).length === 4);
  report.pass('Every page gets its thumbnail');
  await screenshot(page, 'organize-pdf');

  report.step('Editing');
  await card(4).dragTo(card(1));
  report.check((await order()).join() === '4,1,2,3', 'Dragging a page moves it');
  await card(1).locator('[title="Bajar"]').click();
  report.check((await order()).join() === '4,2,1,3', 'The arrows move a page too');
  await card(2).locator('[title="Rotar a la derecha"]').click();
  await card(3).locator('[title="Quitar"]').click();
  report.check((await order()).join() === '4,2,1', 'A page can be removed');
  await card(4).locator('.page-select').click();
  await page.locator('.organize-actions .btn', { hasText: 'Rotar a la izquierda' }).click();
  report.check((await card(4).locator('img').getAttribute('style')).includes('270deg'), 'The selection rotates, and the thumbnail shows it');

  report.step('Saving');
  const organized = join(folder, 'resultado.pdf');
  await mockSaveDialog(app, organized);
  await page.locator('.btn-primary', { hasText: 'Guardar PDF' }).click();
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('PDF guardado'));
  const saved = await PDFDocument.load(readFileSync(organized));
  report.check(saved.getPageCount() === 3, 'The new PDF has the remaining pages');
  report.check(saved.getPages().map((item) => item.getRotation().angle).join() === '270,90,0', 'In the new order, with their rotations');
  report.check((await PDFDocument.load(readFileSync(pdfPath))).getPageCount() === 4, 'The original is intact');

  report.step('Exporting images');
  const images = join(folder, 'imagenes');
  mkdirSync(images);
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, images);
  await page.locator('.panel .btn', { hasText: 'Exportar 1 imagen' }).click();
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('1 imagen exportada'));
  const [single] = readdirSync(images);
  const { width, height } = await sharp(join(images, single)).metadata();
  report.check(single.endsWith('.png') && width === 834 && height === 625, `Exports the selected page, rotated (${width} × ${height})`);

  await page.locator('.organize-header .btn', { hasText: 'Quitar selección' }).or(page.locator('.page-select[aria-pressed="true"]')).first().click();
  await page.locator('.segmented button', { hasText: 'JPG' }).click();
  await page.locator('.panel .btn', { hasText: 'Exportar páginas como imágenes' }).click();
  await page.waitForFunction(() => document.querySelector('.toast:last-child')?.textContent.includes('3 imágenes exportadas'));
  report.check(readdirSync(images).filter((name) => name.endsWith('.jpg')).length === 3, 'With nothing selected, exports every page');

  report.step('Reset');
  await page.locator('.organize-header .btn', { hasText: 'Restablecer' }).click();
  report.check((await order()).join() === '1,2,3,4', 'Reset brings the original pages back');
  await page.locator('.organize-header .btn', { hasText: 'Cerrar' }).click();
  await page.locator('.drop-zone').waitFor();
  report.pass('Close goes back to choosing a file');

  report.step('From the home screen');
  await openTool(page, 'Inicio');
  await mockOpenDialog(app, [pdfPath]);
  await page.locator('.drop-zone').click();
  await page.locator('.suggestion .btn', { hasText: 'Organizar páginas' }).click();
  await page.locator('.page-card').first().waitFor();
  report.pass('A dropped PDF offers organizing it');

  report.check(existsSync(organized) && errors.length === 0, 'No console errors');
  errors.slice(0, 5).forEach((error) => console.log('   !', error.slice(0, 200)));
} catch (error) {
  report.fail(String(error));
  await screenshot(page, 'organize-failure').catch(() => {});
  errors.slice(0, 5).forEach((entry) => console.log('   !', entry.slice(0, 200)));
} finally {
  await app.close().catch(() => {});
}

report.finish();
