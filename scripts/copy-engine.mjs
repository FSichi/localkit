// Copies the AI engines and the PDF viewer's assets to public/: they are served as is, skipping the bundler.
import { copyFileSync, cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'src/renderer/public/engine/lib');
mkdirSync(target, { recursive: true });

const files = [
  'node_modules/@huggingface/transformers/dist/transformers.min.js',
  'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs',
  'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm',
  'node_modules/onnxruntime-web/dist/ort.webgpu.min.mjs',
];
for (const file of files) {
  copyFileSync(join(root, file), join(target, file.split('/').pop()));
}
copyFileSync(join(root, 'node_modules/paddleocr/dist/index.mjs'), join(target, 'paddleocr.mjs'));
for (const folder of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  cpSync(join(root, 'node_modules/pdfjs-dist', folder), join(target, 'pdfjs', folder), { recursive: true });
}
console.log('Engine copied to src/renderer/public/engine/lib');
