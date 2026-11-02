// Shared helpers for the end-to-end tests. They run the real built app with its own data folder.
import { _electron as electron, chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const outputRoot = join(root, 'test/output');
export const screenshots = join(outputRoot, 'screenshots');

const RENDERER_DEBUG_PORT = 9377;
const MAIN_DEBUG_PORT = 9378;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      return await (await fetch(url)).json();
    } catch {
      await wait(500);
    }
  }
  throw new Error(`No response from ${url}`);
}

/** Runs a function in the main process through the Node inspector. */
async function connectToMainProcess() {
  const [{ webSocketDebuggerUrl }] = await fetchJson(`http://127.0.0.1:${MAIN_DEBUG_PORT}/json`);
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve));
  let nextId = 0;
  return async (fn, argument) => {
    const id = ++nextId;
    const expression = `(${fn})(process.mainModule.require('electron'), ${JSON.stringify(argument ?? null)})`;
    const response = new Promise((resolve) => {
      const onMessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== id) return;
        socket.removeEventListener('message', onMessage);
        resolve(message.result);
      };
      socket.addEventListener('message', onMessage);
    });
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
    const result = await response;
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'Main process error');
    return result.result.value;
  };
}

/**
 * Opens the packaged executable the way a user does and connects through Electron's debuggers,
 * exposing the same { app, page, errors } shape as launchApp.
 */
export async function launchPackagedApp(executablePath, data, args = []) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(executablePath, [`--inspect=${MAIN_DEBUG_PORT}`, `--remote-debugging-port=${RENDERER_DEBUG_PORT}`, `--user-data-dir=${data}`, ...args], { env, stdio: 'ignore' });
  const evaluate = await connectToMainProcess();
  await fetchJson(`http://127.0.0.1:${RENDERER_DEBUG_PORT}/json`);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${RENDERER_DEBUG_PORT}`);
  const page = browser.contexts()[0].pages()[0];
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.waitForSelector('.sidebar');
  return { app: { evaluate, close: async () => child.kill() }, page, errors };
}

export async function launchApp({ dataFolder, settings = {}, keepSettings = false, executablePath = process.env.E2E_EXE, args = [] }) {
  const data = join(outputRoot, dataFolder);
  mkdirSync(data, { recursive: true });
  mkdirSync(screenshots, { recursive: true });
  if (!keepSettings) {
    writeFileSync(join(data, 'settings.json'), JSON.stringify({ checkForUpdates: false, recordingsFolder: join(outputRoot, 'documents'), ...settings }));
  }

  if (executablePath) return launchPackagedApp(executablePath, data, args);

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ cwd: root, env, args: ['.', `--user-data-dir=${data}`, ...args] });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.setViewportSize({ width: 1180, height: 780 }).catch(() => {});
  await page.waitForSelector('.sidebar');
  return { app, page, errors };
}

export const openTool = (page, label) => page.locator('.nav-link', { hasText: label }).click();
export const screenshot = (page, name) => page.screenshot({ path: join(screenshots, `${name}.png`) });

export function mockOpenDialog(app, paths) {
  return app.evaluate(({ dialog }, files) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
  }, paths);
}

export function mockSaveDialog(app, path) {
  return app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, path);
}

/** Small check runner: reports every assertion and keeps going, so one failure doesn't hide others. */
export function createReporter() {
  const failures = [];
  return {
    step: (title) => console.log(`\n→ ${title}`),
    pass: (text) => console.log(`  ✓ ${text}`),
    check(condition, text) {
      if (condition) console.log(`  ✓ ${text}`);
      else {
        failures.push(text);
        console.log(`  ✗ ${text}`);
      }
    },
    fail: (text) => failures.push(text),
    finish() {
      console.log(failures.length ? `\nFAILED:\n- ${failures.join('\n- ')}` : '\nAll OK');
      process.exit(failures.length ? 1 : 0);
    },
  };
}
