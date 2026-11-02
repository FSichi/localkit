// Runs Whisper off the UI thread. Served as is, without going through the bundler.
import { pipeline, env } from './lib/transformers.min.js';

const SAMPLE_RATE = 16000;
const FRAME_SECONDS = 0.03; // 30 ms frames to measure the audio energy
const MAX_CHUNK_SECONDS = 29.5; // Whisper handles windows of up to 30 s
const MIN_CHUNK_SECONDS = 20;
const SPLIT_PAUSE_SECONDS = 2; // a silence this long closes the chunk
const SPEECH_MARGIN_SECONDS = 0.25; // audio kept around the speech

// Phrases Whisper invents when there is no speech: they come from the subtitles it was trained on.
const HALLUCINATIONS = /amara\.org|subt[ií]tulos? (realizados|por)|gracias por ver el v[ií]deo|suscr[ií]bete al canal|^\s*[\[(♪].*[\])♪]\s*$/i;

let modelsBaseUrl = '';

env.allowLocalModels = false;
env.useWasmCache = false;
env.useBrowserCache = false;
env.useCustomCache = true;
// The main process downloads models to a folder; they are read through the app protocol.
env.customCache = {
  async match(key) {
    const match = String(key).match(/huggingface\.co\/([^/]+\/[^/]+)\/resolve\/[^/]+\/(.+)$/);
    if (!match) return undefined;
    const response = await fetch(`${modelsBaseUrl}${match[1]}/${match[2]}`);
    return response.ok ? response : undefined;
  },
  async put() {},
};
env.backends.onnx.wasm.wasmPaths = {
  mjs: new URL('./lib/ort-wasm-simd-threaded.asyncify.mjs', import.meta.url).href,
  wasm: new URL('./lib/ort-wasm-simd-threaded.asyncify.wasm', import.meta.url).href,
};
env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(8, navigator.hardwareConcurrency || 1) : 1;

let transcriber = null;
let loadedKey = null;

const post = (message) => self.postMessage(message);

async function loadModel({ model, profile, dtype, modelsUrl }) {
  modelsBaseUrl = modelsUrl;
  const key = `${model}|${profile}`;
  if (transcriber && loadedKey === key) return;
  if (transcriber) await transcriber.dispose?.();
  transcriber = null;
  loadedKey = null;

  const files = new Map();
  transcriber = await pipeline('automatic-speech-recognition', model, {
    device: profile === 'gpu' ? 'webgpu' : 'wasm',
    dtype,
    progress_callback: (progress) => {
      if (progress.status !== 'progress' || !progress.total) return;
      files.set(progress.file, progress);
      let loaded = 0;
      let total = 0;
      for (const file of files.values()) {
        loaded += file.loaded;
        total += file.total;
      }
      post({ type: 'loadProgress', fraction: loaded / total });
    },
  });
  loadedKey = key;
}

function rootMeanSquare(audio, from, to) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += audio[i] * audio[i];
  return Math.sqrt(sum / Math.max(1, to - from));
}

/** Splits audio into speech chunks: skips silences and cuts at the quietest point. */
function findSpeechChunks(audio) {
  const frameSize = Math.round(FRAME_SECONDS * SAMPLE_RATE);
  const frameCount = Math.floor(audio.length / frameSize);
  const levels = new Float32Array(frameCount);
  let peak = 0;
  for (let i = 0; i < frameCount; i++) {
    levels[i] = rootMeanSquare(audio, i * frameSize, (i + 1) * frameSize);
    if (levels[i] > peak) peak = levels[i];
  }
  const threshold = Math.max(0.0015, Math.min(0.006, peak * 0.03));
  const toFrames = (seconds) => Math.round(seconds / FRAME_SECONDS);
  const margin = toFrames(SPEECH_MARGIN_SECONDS);

  const chunks = [];
  let cursor = 0;
  while (cursor < frameCount) {
    while (cursor < frameCount && levels[cursor] < threshold) cursor++;
    if (cursor >= frameCount) break;
    const start = Math.max(0, cursor - margin);
    const limit = start + toFrames(MAX_CHUNK_SECONDS);
    let lastSpeech = cursor;
    let frame = cursor;
    let end = -1;
    for (; frame < frameCount && frame < limit; frame++) {
      if (levels[frame] >= threshold) lastSpeech = frame;
      else if (frame - lastSpeech >= toFrames(SPLIT_PAUSE_SECONDS)) {
        end = lastSpeech + margin;
        break;
      }
    }
    if (end < 0 && frame >= frameCount) end = Math.min(frameCount, lastSpeech + margin);
    if (end < 0) {
      // A long stretch without pauses: cut at the quietest frame near the end.
      let quietest = limit - 1;
      for (let k = start + toFrames(MIN_CHUNK_SECONDS); k < limit; k++) {
        if (levels[k] < levels[quietest]) quietest = k;
      }
      end = quietest;
    }
    chunks.push([start * frameSize, Math.min(audio.length, end * frameSize)]);
    cursor = Math.max(end, start + 1);
  }
  return chunks;
}

async function transcribe({ id, url, language, speaker }) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Prepared audio could not be read.');
  const audio = new Float32Array(await response.arrayBuffer());
  const chunks = findSpeechChunks(audio);
  const speechSamples = chunks.reduce((total, [from, to]) => total + to - from, 0) || 1;
  const segments = [];
  let doneSamples = 0;
  const startedAt = performance.now();

  for (const [from, to] of chunks) {
    const piece = audio.subarray(from, to);
    const offset = from / SAMPLE_RATE;
    const length = piece.length / SAMPLE_RATE;
    const output = await transcriber(piece, {
      return_timestamps: true,
      task: 'transcribe',
      ...(language && language !== 'auto' ? { language } : {}),
    });
    const parts = output.chunks?.length ? output.chunks : [{ text: output.text, timestamp: [0, length] }];
    for (const part of parts) {
      const text = (part.text || '').trim();
      if (!text || HALLUCINATIONS.test(text)) continue;
      const [partStart, partEnd] = part.timestamp || [0, length];
      segments.push({
        start: offset + (partStart ?? 0),
        end: offset + Math.min(partEnd ?? length, length),
        text,
        ...(speaker ? { speaker } : {}),
      });
    }
    doneSamples += to - from;
    post({
      type: 'progress',
      id,
      fraction: doneSamples / speechSamples,
      elapsedSeconds: (performance.now() - startedAt) / 1000,
      partialText: segments.slice(-3).map((segment) => segment.text).join(' '),
    });
  }
  return segments;
}

function errorKind(error) {
  const message = error?.message || String(error);
  return error instanceof RangeError || /allocation failed|out of memory|OOM/i.test(message) ? 'outOfMemory' : message;
}

self.addEventListener('message', async ({ data }) => {
  try {
    if (data.type === 'load') {
      await loadModel(data);
      post({ type: 'done', id: data.id });
    } else if (data.type === 'transcribe') {
      post({ type: 'done', id: data.id, segments: await transcribe(data) });
    }
  } catch (error) {
    post({ type: 'error', id: data.id, message: errorKind(error) });
  }
});

// Errors inside the engine, outside our promises: if they don't arrive, the UI waits forever.
self.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  post({ type: 'error', message: errorKind(event.reason) });
});
