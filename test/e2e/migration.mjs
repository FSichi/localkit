// Opens the packaged app next to a Transcriptor folder left by version 0.1.0 and checks everything came across.
// Usage: npx electron-builder --win --dir --publish never && node test/e2e/migration.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createReporter, launchApp, openTool, outputRoot, root, screenshot } from './harness.mjs';

const dataFolder = join(`data-migration-${Date.now()}`, 'LocalKit');
const data = join(outputRoot, dataFolder);
const legacy = join(data, '..', 'Transcriptor');
const modelFolder = join(legacy, 'modelos', 'onnx-community', 'whisper-base');
mkdirSync(join(legacy, 'biblioteca'), { recursive: true });
mkdirSync(modelFolder, { recursive: true });

writeFileSync(join(modelFolder, 'config.json'), '{}');
writeFileSync(join(legacy, 'ajustes.json'), JSON.stringify({ tema: 'claro', idioma: 'en', fuente: 'sistema', buscarActualizaciones: false, carpetaGrabaciones: join(outputRoot, 'documents') }));
writeFileSync(
  join(legacy, 'biblioteca', 'legacy-item.json'),
  JSON.stringify({
    id: 'legacy-item',
    titulo: 'Reunión vieja',
    tipo: 'grabacion',
    creado: '2026-10-30T10:00:00.000Z',
    duracion: 12,
    fuente: 'ambos',
    estado: 'transcripto',
    modelo: 'Máxima',
    segmentos: [
      { inicio: 0, fin: 2, texto: 'Hola, soy yo', hablante: 'yo' },
      { inicio: 2, fin: 4, texto: 'Y yo soy otro', hablante: 'otros' },
    ],
  }),
);

const report = createReporter();
const { app, page, errors } = await launchApp({ dataFolder, keepSettings: true, executablePath: join(root, 'dist/win-unpacked/LocalKit.exe') });

try {
  report.step('Migration from Transcriptor 0.1.0');
  const settings = JSON.parse(readFileSync(join(data, 'settings.json'), 'utf8'));
  report.check(settings.theme === 'light' && settings.language === 'en' && settings.audioSource === 'system', 'Settings moved to the new folder and schema');
  report.check(settings.recordingsFolder === join(outputRoot, 'documents'), 'The recordings folder is kept');
  report.check(existsSync(join(data, 'models', 'onnx-community', 'whisper-base', 'config.json')), 'Models moved to the new folder');
  report.check(existsSync(join(legacy, 'biblioteca', 'legacy-item.json')), 'The old library file was kept as a safety copy');

  await openTool(page, 'Biblioteca');
  await page.locator('.rows .row', { hasText: 'Reunión vieja' }).click();
  await page.waitForSelector('.transcript');
  const paragraphs = await page.locator('.paragraph').allInnerTexts();
  report.check(paragraphs.length === 2 && paragraphs[0].startsWith('Yo') && paragraphs[1].startsWith('Otros'), 'The old transcript opens with its speakers');
  await screenshot(page, 'migrated-item');
  report.check(errors.length === 0, 'No console errors');
  errors.slice(0, 5).forEach((error) => console.log('   !', error.slice(0, 200)));
} catch (error) {
  report.fail(String(error));
  errors.slice(0, 5).forEach((entry) => console.log('   !', entry.slice(0, 200)));
} finally {
  await app.close().catch(() => {});
}

report.finish();
