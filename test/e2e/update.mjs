// Tests the new-version notice against the real GitHub releases, with an "old" app:
//   npx electron-builder --win --dir --publish never -c.extraMetadata.version=0.0.1
//   node test/e2e/update.mjs
// It really downloads and verifies the installer, but intercepts running it: nothing gets installed.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchPackagedApp, outputRoot, root, screenshot } from './harness.mjs';

const data = join(outputRoot, 'data-update');
const launchLog = join(outputRoot, 'installer-launched.json');
mkdirSync(data, { recursive: true });
rmSync(launchLog, { force: true });
writeFileSync(join(data, 'settings.json'), JSON.stringify({ recordingsFolder: join(outputRoot, 'documents') }));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const { app, page } = await launchPackagedApp(join(root, 'dist/win-unpacked/Transcriptor.exe'), data);

let exitCode = 1;
try {
  // Replaces child_process.spawn with one that only records what would run.
  await app.evaluate((_electron, logPath) => {
    const childProcess = process.mainModule.require('node:child_process');
    const fs = process.mainModule.require('node:fs');
    childProcess.spawn = (file, args) => {
      fs.writeFileSync(logPath, JSON.stringify({ file, args }));
      return { unref() {} };
    };
  }, launchLog);

  await page.waitForSelector('[aria-label="Versión nueva"]', { timeout: 20000 });
  console.log('✓ Notice on open:', (await page.locator('.version-chip').innerText()).trim());
  await screenshot(page, 'update');

  await page.locator('.dialog-actions .btn', { hasText: 'Más tarde' }).click();
  await page.waitForSelector('[aria-label="Versión nueva"]', { state: 'detached' });
  await page.locator('.update-badge').waitFor();
  console.log('✓ "Later" closes it and leaves a badge in the sidebar');
  const { postponedUpdate } = JSON.parse(readFileSync(join(data, 'settings.json'), 'utf8'));
  console.log('✓ Postponed until', new Date(postponedUpdate.until).toLocaleDateString());

  await page.locator('.update-badge').click();
  await page.locator('.dialog-actions .btn-primary').click();
  for (let second = 0; second < 180 && !existsSync(launchLog); second++) await wait(1000);
  if (!existsSync(launchLog)) throw new Error(`The installer was not launched: ${await page.locator('.error-text').innerText().catch(() => 'no message')}`);
  const { file, args } = JSON.parse(readFileSync(launchLog, 'utf8'));
  console.log('✓ SHA-256 verified. Runs:', file.split(/[\\/]/).pop(), args.join(' '));
  exitCode = 0;
  console.log('All OK');
} catch (error) {
  console.error('✗', error.message);
} finally {
  await app.close();
}
process.exit(exitCode);
