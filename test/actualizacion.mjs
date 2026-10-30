// Prueba el aviso de actualización contra los releases reales de GitHub, con una app "vieja":
//   npx electron-builder --win --dir --publish never -c.extraMetadata.version=0.0.1
//   node test/actualizacion.mjs
// Baja y verifica el instalador de verdad, pero intercepta su ejecución: no instala nada.
// Se conecta por los depuradores de Electron: abre el ejecutable tal como lo abre un usuario.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUERTO_INTERFAZ = 9377;
const PUERTO_PROCESO = 9378;
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const salida = join(raiz, 'test/salida');
const datos = join(salida, 'datos-actualizacion');
const registro = join(salida, 'instalador-lanzado.json');
mkdirSync(datos, { recursive: true });
rmSync(registro, { force: true });
writeFileSync(join(datos, 'ajustes.json'), JSON.stringify({ carpetaGrabaciones: join(salida, 'documentos') }));

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const proceso = spawn(
  join(raiz, 'dist/win-unpacked/Transcriptor.exe'),
  [`--inspect=${PUERTO_PROCESO}`, `--remote-debugging-port=${PUERTO_INTERFAZ}`, `--user-data-dir=${datos}`],
  { env, stdio: 'ignore' },
);

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function jsonDe(url) {
  for (let i = 0; i < 40; i++) {
    try {
      return await (await fetch(url)).json();
    } catch {
      await esperar(500);
    }
  }
  throw new Error(`Sin respuesta de ${url}`);
}

/** Reemplaza child_process.spawn en el proceso principal por uno que solo anota qué se iba a lanzar. */
async function interceptarInstalador() {
  const [{ webSocketDebuggerUrl }] = await jsonDe(`http://127.0.0.1:${PUERTO_PROCESO}/json`);
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  const expresion = `(() => {
    const cp = process.mainModule.require('node:child_process');
    const fs = process.mainModule.require('node:fs');
    cp.spawn = (archivo, argumentos) => {
      fs.writeFileSync(${JSON.stringify(registro)}, JSON.stringify({ archivo, argumentos }));
      return { unref() {} };
    };
    return 'ok';
  })()`;
  const respuesta = new Promise((r) => ws.addEventListener('message', (e) => r(JSON.parse(e.data)), { once: true }));
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expresion, returnByValue: true } }));
  const { result } = await respuesta;
  ws.close();
  if (result?.result?.value !== 'ok') throw new Error('No se pudo interceptar el instalador: ' + JSON.stringify(result));
}

let codigo = 1;
try {
  await interceptarInstalador();
  await jsonDe(`http://127.0.0.1:${PUERTO_INTERFAZ}/json`);
  const navegador = await chromium.connectOverCDP(`http://127.0.0.1:${PUERTO_INTERFAZ}`);
  const v = navegador.contexts()[0].pages()[0];
  await v.waitForSelector('.rail');
  await v.waitForSelector('[aria-label="Versión nueva"]', { timeout: 20000 });
  console.log('✓ Aviso al abrir:', (await v.locator('.version-chip').innerText()).trim());
  console.log('  Notas:', (await v.locator('.notas-seccion li').first().innerText()).slice(0, 80));
  await v.screenshot({ path: join(salida, 'capturas/actualizacion.png') });

  await v.locator('.dialogo-acciones .btn', { hasText: 'Más tarde' }).click();
  await v.waitForSelector('[aria-label="Versión nueva"]', { state: 'detached' });
  await v.locator('.pastilla-version').waitFor();
  console.log('✓ "Más tarde" lo cierra y queda el aviso en la barra lateral');
  const pospuesta = JSON.parse(readFileSync(join(datos, 'ajustes.json'), 'utf8')).pospuesta;
  console.log('✓ Pospuesto hasta', new Date(pospuesta.hasta).toLocaleDateString('es-AR'));

  await v.locator('.pastilla-version').click();
  await v.locator('.dialogo-acciones .btn-primario').click();
  await esperar(1500);
  await v.screenshot({ path: join(salida, 'capturas/actualizacion-progreso.png') });

  for (let i = 0; i < 180 && !existsSync(registro); i++) await esperar(1000);
  if (!existsSync(registro)) throw new Error('No lanzó el instalador: ' + (await v.locator('.mensaje-error').innerText().catch(() => 'sin mensaje')));
  const { archivo, argumentos } = JSON.parse(readFileSync(registro, 'utf8'));
  console.log('✓ SHA-256 verificado. Lanza:', archivo.split(/[\\/]/).pop(), argumentos.join(' '));
  codigo = 0;
  console.log('Todo OK');
} catch (err) {
  console.error('✗', err.message);
} finally {
  proceso.kill();
}
process.exit(codigo);
