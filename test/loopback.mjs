// Prueba real del sonido del sistema, sin dispositivos simulados: reproduce una voz a volumen
// bajo por los parlantes y comprueba que la grabación la capture y la transcriba.
// Uso: node test/loopback.mjs audio.wav
import { _electron as electron } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const salida = join(raiz, 'test/salida');
const datos = join(salida, 'datos');
mkdirSync(datos, { recursive: true });
writeFileSync(join(datos, 'ajustes.json'), JSON.stringify({ carpetaGrabaciones: join(salida, 'documentos'), modelo: 'onnx-community/whisper-base', fuente: 'sistema' }));

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ cwd: raiz, env, args: ['.', `--user-data-dir=${datos}`] });
const v = await app.firstWindow();
const errores = [];
v.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
await v.waitForSelector('.rail');
await v.locator('.rail-link', { hasText: 'Grabar' }).click();
await v.locator('.btn-grabar').click();
await v.waitForSelector('.grabando', { timeout: 15000 });
const pistas = await v.evaluate(async (base64) => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  window.__voz = new Audio(URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })));
  window.__voz.volume = 0.2;
  await window.__voz.play();
  return window.__voz.duration;
}, readFileSync(process.argv[2]).toString('base64'));
await v.waitForTimeout(5000);
const pico = await v.evaluate(() => {
  const c = document.querySelector('.onda');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
  return n;
});
console.log('Píxeles de la onda:', pico);
await v.screenshot({ path: join(salida, 'capturas/loopback.png') });
await v.waitForTimeout(Math.max(0, (pistas - 5) * 1000 + 800));
await v.locator('.grabando-acciones .btn-primario').click();
await v.waitForSelector('.grabando', { state: 'detached', timeout: 30000 });
await v.waitForTimeout(800);
await v.locator('.rail-link', { hasText: 'Transcribir' }).click();
await v.waitForSelector('.trabajo', { state: 'detached', timeout: 120000 });
await v.locator('.filas .fila').first().click();
await v.waitForTimeout(1500);
console.log('Resultado:', (await v.locator('.pagina').innerText()).slice(0, 500));
console.log('Errores:', errores.slice(0, 5));
await app.close();
