// Runs text recognition off the UI thread. Served as is, without going through the bundler.
import * as ort from './lib/ort.webgpu.min.mjs';
import { PaddleOcrService } from './lib/paddleocr.mjs';

ort.env.wasm.wasmPaths = {
  mjs: new URL('./lib/ort-wasm-simd-threaded.asyncify.mjs', import.meta.url).href,
  wasm: new URL('./lib/ort-wasm-simd-threaded.asyncify.wasm', import.meta.url).href,
};
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(8, navigator.hardwareConcurrency || 1) : 1;

/** Errors only: it warns about every operation it leaves on the CPU, which is normal for these models. */
const LOG_ERRORS_ONLY = 3;

let service = null;
let loadedId = null;

const post = (message) => self.postMessage(message);

async function fetchModelFile(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read ${url}`);
  return response;
}

/** The recognizer's alphabet is stored in its YAML settings. */
function readAlphabet(yaml) {
  const characters = [];
  for (const line of yaml.slice(yaml.indexOf('character_dict:')).split('\n').slice(1)) {
    const entry = line.match(/^\s*-\s+(.*)$/);
    if (entry) characters.push(entry[1].replace(/^(['"])(.*)\1$/, '$2').replace(/''/g, "'"));
    else if (characters.length && /^\S/.test(line)) break;
  }
  if (characters.at(-1) !== ' ') characters.push(' ');
  return characters;
}

function createService({ preset, detector, recognizer, alphabet, providers }) {
  const session = {
    Tensor: ort.Tensor,
    InferenceSession: { create: (buffer) => ort.InferenceSession.create(buffer, { executionProviders: providers, logSeverityLevel: LOG_ERRORS_ONLY }) },
  };
  return PaddleOcrService.createInstance({
    ort: session,
    modelPreset: preset,
    // Copies, so a failed attempt on the GPU leaves the originals for the CPU.
    detection: { modelBuffer: detector.slice(0) },
    recognition: { modelBuffer: recognizer.slice(0), charactersDictionary: alphabet },
  });
}

async function load({ modelId, preset, profile, modelsUrl }) {
  if (service && loadedId === modelId) return;
  await service?.destroy?.();
  service = null;
  loadedId = null;

  const base = `${modelsUrl}${modelId}/`;
  const [detector, recognizer, alphabet] = await Promise.all([
    fetchModelFile(`${base}det.onnx`).then((response) => response.arrayBuffer()),
    fetchModelFile(`${base}rec.onnx`).then((response) => response.arrayBuffer()),
    fetchModelFile(`${base}rec.yml`).then(async (response) => readAlphabet(await response.text())),
  ]);
  const models = { preset, detector, recognizer, alphabet };
  try {
    if (profile !== 'gpu') throw new Error('No GPU');
    service = await createService({ ...models, providers: ['webgpu', 'wasm'] });
  } catch {
    service = await createService({ ...models, providers: ['wasm'] });
  }
  loadedId = modelId;
}

async function recognize({ width, height, data }) {
  const raw = await service.recognize({ width, height, data });
  return {
    text: service.processRecognition(raw).text,
    lines: raw.map(({ text, box }) => ({ text, x: box.x, y: box.y, width: box.width, height: box.height })),
  };
}

self.addEventListener('message', async ({ data }) => {
  try {
    if (data.type === 'load') {
      await load(data);
      post({ type: 'done', id: data.id });
    } else if (data.type === 'recognize') {
      post({ type: 'done', id: data.id, ...(await recognize(data)) });
    }
  } catch (error) {
    post({ type: 'error', id: data.id, message: error?.message || String(error) });
  }
});

// Errors inside the engine, outside our promises: if they don't arrive, the UI waits forever.
self.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  post({ type: 'error', message: event.reason?.message || String(event.reason) });
});
