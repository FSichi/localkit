// End-to-end test of the Markdown reader, including a hostile document.
// Usage: npx electron-vite build && node test/e2e/markdown.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, PDFName } from 'pdf-lib';
import sharp from 'sharp';
import { createReporter, launchApp, mockOpenDialog, mockSaveDialog, openTool, outputRoot, root, screenshot } from './harness.mjs';

const electronPath = createRequire(import.meta.url)('electron');
const dataFolder = `data-markdown-${Date.now()}`;
const folder = join(outputRoot, `${dataFolder}-documents`);
mkdirSync(folder, { recursive: true });

const documentPath = join(folder, 'prueba.md');
const otherPath = join(folder, 'otro.md');
const pdfPath = join(folder, 'prueba.pdf');

await sharp({ create: { width: 64, height: 48, channels: 3, background: '#3e63dd' } }).png().toFile(join(folder, 'imagen.png'));
writeFileSync(otherPath, '# Otro documento\n\nSin nada especial.\n');
writeFileSync(
  documentPath,
  `---
title: esto no se tiene que ver
---
# Documento de prueba

Una canción, otra CANCION y una **can**ción partida.

[interno](#seccion-dos) [externo](https://example.com/page) [otro](otro.md) [peligroso](file:///C:/Windows/notepad.exe)

![local](imagen.png)
![remota](https://example.com/tracker.png)
![compartida](\\\\\\\\server\\\\share\\\\x.png)

<script>window.__pwned = 1</script>
<img src="x" onerror="window.__pwned = 2">
<a href="javascript:window.__pwned = 3">malo</a>
<iframe src="https://example.com/frame"></iframe>
<style>body { display: none }</style>
<div style="position: fixed; inset: 0">encima de todo</div>
<form action="https://example.com/steal"><input name="secret"><button>Enviar</button></form>
<svg><script>window.__pwned = 4</script></svg>

| Columna | Otra |
|---|---|
| 1 | 2 |

- [x] hecha
- [ ] pendiente

## Sección uno

\`\`\`js
const answer = 42; // comentario
\`\`\`

## Sección dos

${'Relleno para que haga falta desplazarse.\n\n'.repeat(60)}

### Final
`,
);

const report = createReporter();
const { app, page, errors } = await launchApp({ dataFolder, args: [documentPath] });
const requests = [];
page.on('request', (request) => requests.push(request.url()));

const article = page.locator('.md-article');

try {
  report.step('Opening');
  await article.waitFor();
  report.check((await page.locator('.md-title').innerText()) === 'prueba.md', 'A file passed by Windows opens in the reader');
  report.check(!(await article.innerText()).includes('esto no se tiene que ver'), 'Front matter is not shown');
  await screenshot(page, 'markdown');

  report.step('Hostile content');
  const unsafe = await page.evaluate(() => ({
    pwned: window.__pwned,
    tags: document.querySelectorAll('.md-article :is(script, iframe, style, form, svg, button:not(.md-copy), input:not([type="checkbox"]))').length,
    styled: document.querySelectorAll('.md-article [style]:not([style=""]), .md-article [onerror]').length,
    javascriptLinks: [...document.querySelectorAll('.md-article a')].filter((link) => /^(javascript|file):/i.test(link.getAttribute('href') ?? '')).length,
    bodyVisible: getComputedStyle(document.body).display !== 'none',
  }));
  report.check(unsafe.pwned === undefined, 'No script ran');
  report.check(unsafe.tags === 0, 'Scripts, frames, forms and styles are removed');
  report.check(unsafe.styled === 0 && unsafe.javascriptLinks === 0, 'Inline styles, handlers and dangerous links are removed');
  report.check(unsafe.bodyVisible, 'A document cannot restyle the app');
  await page.waitForTimeout(500);
  report.check(!requests.some((url) => url.includes('example.com') || url.includes('server')), 'Nothing is requested from the network');
  report.check((await page.locator('.md-blocked-image').count()) === 3, 'Remote, shared-folder and missing images are blocked');
  const localImage = await page.locator('.md-article img').evaluate((image) => image.complete && image.naturalWidth);
  report.check(localImage === 64, 'An image next to the document loads');

  report.step('Reading');
  report.check((await page.locator('.md-outline button').count()) === 4, 'The outline lists the headings');
  await page.locator('.md-outline button', { hasText: 'Final' }).click();
  await page.waitForFunction(() => document.querySelector('.md-outline button[aria-current]')?.textContent === 'Final');
  report.check(true, 'The outline jumps and follows the scroll');
  await page.locator('.md-outline button', { hasText: 'Sección uno' }).click();
  report.check((await page.locator('.md-article pre .hljs-keyword').count()) > 0, 'Code is highlighted');
  await page.locator('.md-article pre').hover();
  await page.locator('.md-copy').click();
  const clipboardText = await app.evaluate(({ clipboard }) => clipboard.readText());
  report.check(clipboardText.trim() === 'const answer = 42; // comentario', 'Code blocks copy their code');
  report.check((await page.locator('.md-article table').count()) === 1 && (await page.locator('.md-article input[type="checkbox"]').count()) === 2, 'Tables and task lists render');

  report.step('Search');
  await page.keyboard.press('Control+f');
  await page.keyboard.type('cancion');
  const counter = page.locator('.md-search .numeric');
  report.check((await counter.innerText()) === '1/3', 'Finds matches ignoring case and accents, also across formatting');
  await page.keyboard.press('Enter');
  report.check((await counter.innerText()) === '2/3', 'Enter moves to the next match');
  report.check(await page.evaluate(() => CSS.highlights.get('md-search')?.size === 3), 'Matches are painted');
  await screenshot(page, 'markdown-search');
  await page.keyboard.press('Escape');
  report.check(await page.evaluate(() => !CSS.highlights.get('md-search')?.size), 'Escape clears the search');

  report.step('Links');
  await app.evaluate(({ shell }) => {
    globalThis.openedUrls = [];
    shell.openExternal = async (url) => globalThis.openedUrls.push(url);
  });
  await page.locator('.md-article a', { hasText: 'externo' }).click();
  await page.waitForTimeout(300);
  report.check((await app.evaluate(() => globalThis.openedUrls)).join() === 'https://example.com/page', 'Web links open in the browser');
  await page.locator('.md-article a', { hasText: 'peligroso' }).click();
  await page.waitForTimeout(200);
  report.check((await app.evaluate(() => globalThis.openedUrls)).length === 1, 'Links to local programs do nothing');
  await page.locator('.md-article a', { hasText: 'interno' }).click();
  report.check(await page.evaluate(() => document.getElementById('seccion-dos').getBoundingClientRect().top < 400), 'Links inside the document jump to the section');

  report.step('Export');
  await mockSaveDialog(app, pdfPath);
  await page.locator('.md-toolbar .btn', { hasText: 'Exportar a PDF' }).click();
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('PDF exportado'));
  const pdf = await PDFDocument.load(readFileSync(pdfPath));
  report.check(pdf.getPageCount() >= 2, `Exports a PDF (${pdf.getPageCount()} pages)`);
  report.check(Boolean(pdf.getPages()[0].node.Resources()?.lookup(PDFName.of('XObject'))), 'The PDF includes the local image');

  report.step('Other documents');
  await page.locator('.md-article a', { hasText: 'otro' }).click();
  await page.waitForFunction(() => document.querySelector('.md-title')?.textContent === 'otro.md');
  report.check(true, 'A link to another document opens it in the reader');

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const userData = `--user-data-dir=${join(outputRoot, dataFolder)}`;
  const packaged = process.env.E2E_EXE;
  spawn(packaged ?? electronPath, packaged ? [documentPath, userData] : ['.', documentPath, userData], { cwd: root, env, stdio: 'ignore' });
  await page.waitForFunction(() => document.querySelector('.md-title')?.textContent === 'prueba.md');
  report.check(true, 'A file opened from Windows with the app running reaches the same window');

  await mockOpenDialog(app, [otherPath]);
  await page.locator('.md-toolbar .btn', { hasText: 'Abrir otro' }).click();
  await page.waitForFunction(() => document.querySelector('.md-title')?.textContent === 'otro.md');
  report.check(true, 'Open another picks a new document');

  await openTool(page, 'Inicio');
  await openTool(page, 'Lector de Markdown');
  report.check((await page.locator('.md-title').innerText()) === 'otro.md', 'The open document survives switching tools');

  writeFileSync(join(folder, 'grande.md'), 'x'.repeat(21 * 1024 * 1024));
  await mockOpenDialog(app, [join(folder, 'grande.md')]);
  await page.locator('.md-toolbar .btn', { hasText: 'Abrir otro' }).click();
  await page.waitForFunction(() => document.querySelector('.toast.error')?.textContent.includes('demasiado grande'));
  report.check(true, 'A huge file shows a readable error');

  // Chromium reports the hostile handlers to the security policy while parsing them; none of them ran.
  const unexpected = errors.filter((error) => !error.includes('Content Security Policy'));
  report.check(existsSync(pdfPath) && unexpected.length === 0, 'No console errors');
  unexpected.slice(0, 5).forEach((error) => console.log('   !', error.slice(0, 200)));
} catch (error) {
  report.fail(String(error));
  errors.slice(0, 5).forEach((entry) => console.log('   !', entry.slice(0, 200)));
} finally {
  await app.close().catch(() => {});
}

report.finish();
