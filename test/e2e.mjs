// Prueba de punta a punta sobre la app real (ya compilada). Usa una carpeta de datos propia.
// Uso: node test/e2e.mjs [audio-mic.wav] [audio-sistema.wav] [--maxima] [--sin-grabar]
// Las dos fuentes de la grabación se simulan con archivos distintos, en silencio, para comprobar que
// cada voz termina en su pista. La captura real del sistema la cubre test/loopback.mjs.
import { _electron as electron } from 'playwright';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const salida = join(raiz, 'test/salida');
const capturas = join(salida, 'capturas');
const datos = join(salida, 'datos');
mkdirSync(capturas, { recursive: true });
mkdirSync(datos, { recursive: true });

const args = process.argv.slice(2);
const opciones = new Set(args.filter((a) => a.startsWith('--')));
const [audioMic, audioSistema] = args.filter((a) => !a.startsWith('--'));
const CALIDAD = opciones.has('--maxima') ? 'onnx-community/whisper-large-v3-turbo' : 'onnx-community/whisper-base';

writeFileSync(join(datos, 'ajustes.json'), JSON.stringify({ carpetaGrabaciones: join(salida, 'documentos'), modelo: CALIDAD, tema: 'oscuro' }));

const entorno = { ...process.env };
delete entorno.ELECTRON_RUN_AS_NODE;

const app = await electron.launch({
  ...(process.env.E2E_EXE ? { executablePath: process.env.E2E_EXE } : {}),
  cwd: raiz,
  env: entorno,
  args: [
    '.',
    `--user-data-dir=${datos}`,
  ],
});
const paso = (t) => console.log(`\n→ ${t}`);
const ok = (t) => console.log(`  ✓ ${t}`);
const falla = [];
const comprobar = (condicion, texto) => {
  if (condicion) ok(texto);
  else {
    falla.push(texto);
    console.log(`  ✗ ${texto}`);
  }
};

const ventana = await app.firstWindow();
const errores = [];
ventana.on('pageerror', (e) => errores.push(String(e)));
ventana.on('console', (m) => {
  if (m.type() === 'error') errores.push(m.text());
});
await ventana.setViewportSize({ width: 1180, height: 780 }).catch(() => {});
const foto = (n) => ventana.screenshot({ path: join(capturas, `${n}.png`) });
const ir = (texto) => ventana.locator('.rail-link', { hasText: texto }).click();

try {
  await ventana.waitForSelector('.rail');
  paso('Interfaz');
  const equipo = await ventana.evaluate(async () => {
    const a = await navigator.gpu?.requestAdapter();
    return { gpu: !!a, f16: !!a?.features.has('shader-f16'), aislado: crossOriginIsolated, seguro: isSecureContext, url: location.href };
  });
  console.log('  ', equipo);
  comprobar(equipo.gpu, 'WebGPU disponible');
  comprobar(equipo.aislado, 'Aislamiento de origen activo (hilos en CPU)');
  await foto('1-transcribir-vacio');
  await ir('Grabar');
  await foto('2-grabar');
  await ir('Ajustes');
  await ventana.waitForTimeout(400);
  await foto('3-ajustes');
  await ir('Transcribir');

  paso('Transcribir un archivo');
  await app.evaluate(({ dialog }, ruta) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [ruta] });
  }, audioMic);
  await ventana.locator('.zona').click();
  await ventana.waitForSelector('.trabajo');
  await ventana.waitForTimeout(1500);
  await foto('4-trabajo');
  const t0 = Date.now();
  await ventana.waitForSelector('.trabajo', { state: 'detached', timeout: 420000 });
  ok(`Terminó en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await ventana.waitForSelector('.filas .fila');
  await ventana.locator('.filas .fila').first().click();
  await ventana.waitForSelector('.transcripcion');
  const texto = await ventana.locator('.transcripcion').innerText();
  console.log('  ', texto.slice(0, 220).replace(/\s+/g, ' '));
  comprobar(/transcribir archivos de audio/i.test(texto), 'La transcripción contiene el texto esperado');
  comprobar((await ventana.locator('.reproductor').count()) === 1, 'Tiene reproductor');

  paso('Salto en el reproductor (rangos del protocolo)');
  await ventana.locator('.parrafo').nth(1).click();
  await ventana.waitForTimeout(900);
  const tiempoTexto = await ventana.locator('.reproductor .num').first().innerText();
  comprobar(tiempoTexto !== '00:00', `El audio saltó y suena (${tiempoTexto})`);
  comprobar((await ventana.locator('.parrafo.activo').count()) === 1, 'Resalta el párrafo que suena');
  await ventana.locator('.play').click();
  await foto('5-detalle');

  paso('Exportar');
  const carpetaExporte = join(salida, 'exportes');
  mkdirSync(carpetaExporte, { recursive: true });
  for (const formato of ['txt', 'md', 'pdf', 'srt']) {
    const destino = join(carpetaExporte, `prueba.${formato}`);
    await app.evaluate(({ dialog }, ruta) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: ruta });
    }, destino);
    await ventana.locator('.grupo .btn', { hasText: formato.toUpperCase() }).click();
    await ventana.waitForTimeout(formato === 'pdf' ? 2500 : 500);
    comprobar(existsSync(destino) && statSync(destino).size > 50, `${formato.toUpperCase()} generado`);
  }
  comprobar(readFileSync(join(carpetaExporte, 'prueba.pdf')).subarray(0, 4).toString() === '%PDF', 'El PDF es válido');

  if (!opciones.has('--sin-grabar')) {
    paso('Grabar PC y micrófono');
    await ir('Grabar');
    await ventana.evaluate(async ([mic, sistema]) => {
      const flujo = async (base64) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const audio = new Audio(URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })));
        audio.muted = true;
        await audio.play();
        return { audio, flujo: audio.captureStream() };
      };
      const a = await flujo(mic);
      const b = await flujo(sistema);
      window.__voz = b.audio;
      window.__mic = a.audio;
      navigator.mediaDevices.getUserMedia = async () => a.flujo;
      navigator.mediaDevices.getDisplayMedia = async () => b.flujo;
    }, [readFileSync(audioMic).toString('base64'), readFileSync(audioSistema).toString('base64')]);
    await ventana.locator('.btn-grabar').click();
    await ventana.waitForSelector('.grabando', { timeout: 15000 });
    await ventana.waitForTimeout(6000);
    await foto('6-grabando');
    const onda = await ventana.evaluate(() => {
      const c = document.querySelector('.onda');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let pintados = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]) pintados++;
      return pintados;
    });
    comprobar(onda > 500, `La onda muestra señal (${onda} px)`);
    await ventana.locator('.rail-link', { hasText: 'Biblioteca' }).click();
    await ventana.waitForTimeout(500);
    await foto('7-grabando-rail');
    await ir('Grabar');
    // El clip más corto termina, su pista se corta y la app guarda sola lo grabado.
    await ventana.waitForSelector('.grabando', { state: 'detached', timeout: 40000 });
    ok('Al cortarse una fuente, la grabación se guardó sola');
    await ventana.waitForTimeout(800);
    await ir('Transcribir');
    await ventana.waitForSelector('.trabajo');
    await ventana.waitForSelector('.trabajo', { state: 'detached', timeout: 300000 });
    await ventana.locator('.filas .fila').first().click();
    await ventana.waitForSelector('.transcripcion');
    await ventana.waitForTimeout(500);
    await foto('8-grabacion-transcripta');
    const parrafos = await ventana.locator('.parrafo').allInnerTexts();
    parrafos.forEach((p) => console.log('   ·', p.slice(0, 120).replace(/\s+/g, ' ')));
    const hablantes = await ventana.locator('.hablante').allInnerTexts();
    comprobar(hablantes.includes('Yo'), 'Hay frases de "Yo" (micrófono)');
    comprobar(hablantes.includes('Otros'), 'Hay frases de "Otros" (sonido de la PC)');
    const dirs = readdirSync(join(salida, 'documentos/Grabaciones'));
    const ultima = join(salida, 'documentos/Grabaciones', dirs.sort().at(-1));
    console.log('  ', readdirSync(ultima).map((f) => `${f} (${(statSync(join(ultima, f)).size / 1e6).toFixed(2)} MB)`).join(', '));
    comprobar(existsSync(join(ultima, 'grabacion.mp3')), 'Se generó el MP3');
    comprobar(!existsSync(join(ultima, 'en-curso.json')), 'La grabación quedó cerrada');
    const delMic = parrafos.filter((p) => p.startsWith('Yo')).join(' ');
    const delSistema = parrafos.filter((p) => p.startsWith('Otros')).join(' ');
    comprobar(/prueba|transcribir/i.test(delMic) && !/presupuesto|Discord/i.test(delMic), 'La voz del micrófono quedó solo en "Yo"');
    comprobar(/presupuesto|Discord/i.test(delSistema) && !/transcribir archivos/i.test(delSistema), 'La voz de la PC quedó solo en "Otros"');
  }

  paso('Casos de error');
  await ir('Transcribir');
  await app.evaluate(({ dialog }, ruta) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [ruta] });
  }, join(raiz, 'package.json'));
  await ventana.locator('.zona').click();
  await ventana.waitForSelector('.toast.error', { timeout: 20000 });
  ok('Un archivo inválido muestra error: ' + (await ventana.locator('.toast.error').innerText()));
  comprobar((await ventana.locator('.trabajo').count()) === 0, 'El trabajo inválido no queda colgado');
  await app.evaluate(({ dialog }, ruta) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [ruta] });
  }, audioMic);
  await ventana.locator('.zona').click();
  await ventana.waitForSelector('.trabajo .btn');
  await ventana.waitForFunction(() => /Transcribiendo|%/.test(document.querySelector('.trabajo-info span')?.textContent ?? ''), null, { timeout: 90000 });
  await ventana.locator('.trabajo .btn').click();
  await ventana.waitForSelector('.trabajo', { state: 'detached', timeout: 10000 });
  ok('Cancelar corta la transcripción');
  errores.length = 0;

  paso('Biblioteca y búsqueda');
  await ir('Biblioteca');
  await ventana.locator('.campo input').fill('Whisper');
  await ventana.waitForTimeout(500);
  await foto('9-biblioteca');
  comprobar((await ventana.locator('.fila-fragmento').count()) > 0, 'La búsqueda encuentra por contenido');

  paso('Tema claro');
  await ir('Ajustes');
  await ventana.locator('.seg button', { hasText: 'Claro' }).click();
  await ventana.waitForTimeout(400);
  await foto('10-ajustes-claro');
  await ventana.locator('.seg button', { hasText: 'Oscuro' }).click();

  comprobar(errores.length === 0, 'Sin errores de consola');
  errores.slice(0, 8).forEach((e) => console.log('   !', e.slice(0, 220)));
} catch (err) {
  falla.push(String(err));
  console.error(err);
  await foto('error').catch(() => {});
  errores.slice(0, 8).forEach((e) => console.log('   !', e.slice(0, 220)));
} finally {
  await app.close().catch(() => {});
}

console.log(falla.length ? `\nFALLÓ:\n- ${falla.join('\n- ')}` : '\nTodo OK');
process.exit(falla.length ? 1 : 0);
