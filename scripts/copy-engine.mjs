// Copies transformers.js and the ONNX engine to public/: they are served as is, skipping the bundler.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'src/renderer/public/engine/lib');
mkdirSync(target, { recursive: true });

const files = [
  'node_modules/@huggingface/transformers/dist/transformers.min.js',
  'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs',
  'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm',
];
for (const file of files) {
  copyFileSync(join(root, file), join(target, file.split('/').pop()));
}
console.log('Engine copied to src/renderer/public/engine/lib');
