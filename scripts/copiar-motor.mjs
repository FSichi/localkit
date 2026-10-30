// Copia transformers.js y el motor ONNX a public/: se sirven tal cual, sin pasar por el bundler.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'src/renderer/public/motor/lib');
mkdirSync(destino, { recursive: true });

const archivos = [
  'node_modules/@huggingface/transformers/dist/transformers.min.js',
  'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs',
  'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm',
];
for (const archivo of archivos) {
  copyFileSync(join(raiz, archivo), join(destino, archivo.split('/').pop()));
}
console.log('Motor copiado a src/renderer/public/motor/lib');
