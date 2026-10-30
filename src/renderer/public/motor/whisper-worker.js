// Worker que corre Whisper fuera del hilo de la interfaz. Se sirve tal cual, sin pasar por el bundler.
import { pipeline, env } from './lib/transformers.min.js';

const FRECUENCIA = 16000;
const VENTANA = 0.03; // cuadros de 30 ms para medir la energía del audio
const MAX_TRAMO = 29.5; // Whisper procesa ventanas de hasta 30 s
const MIN_TRAMO = 20;
const PAUSA_CORTE = 2; // un silencio así de largo cierra el tramo
const MARGEN = 0.25; // audio que se conserva alrededor de la voz

// Frases que Whisper inventa cuando no hay voz: vienen de los subtítulos con los que se entrenó.
const ALUCINACIONES = /amara\.org|subt[ií]tulos? (realizados|por)|gracias por ver el v[ií]deo|suscr[ií]bete al canal|^\s*[\[(♪].*[\])♪]\s*$/i;

env.allowLocalModels = false;
env.useWasmCache = false;
env.useBrowserCache = false;
env.useCustomCache = true;
// Los modelos los baja el proceso principal a una carpeta y se leen desde el protocolo propio.
env.customCache = {
  async match(clave) {
    const m = String(clave).match(/huggingface\.co\/([^/]+\/[^/]+)\/resolve\/[^/]+\/(.+)$/);
    if (!m) return undefined;
    const respuesta = await fetch(`transcriptor://modelos/${m[1]}/${m[2]}`);
    return respuesta.ok ? respuesta : undefined;
  },
  async put() {},
};
env.backends.onnx.wasm.wasmPaths = {
  mjs: new URL('./lib/ort-wasm-simd-threaded.asyncify.mjs', import.meta.url).href,
  wasm: new URL('./lib/ort-wasm-simd-threaded.asyncify.wasm', import.meta.url).href,
};
env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(8, navigator.hardwareConcurrency || 1) : 1;

let transcriptor = null;
let cargado = null;

const enviar = (mensaje) => self.postMessage(mensaje);

async function cargar({ modelo, perfil, dtype }) {
  const clave = `${modelo}|${perfil}`;
  if (transcriptor && cargado === clave) return;
  if (transcriptor) await transcriptor.dispose?.();
  transcriptor = null;
  cargado = null;

  const archivos = new Map();
  transcriptor = await pipeline('automatic-speech-recognition', modelo, {
    device: perfil === 'gpu' ? 'webgpu' : 'wasm',
    dtype,
    progress_callback: (p) => {
      if (p.status !== 'progress' || !p.total) return;
      archivos.set(p.file, p);
      let hechos = 0;
      let total = 0;
      for (const a of archivos.values()) {
        hechos += a.loaded;
        total += a.total;
      }
      enviar({ tipo: 'carga', fraccion: hechos / total });
    },
  });
  cargado = clave;
}

function energia(audio, desde, hasta) {
  let suma = 0;
  for (let i = desde; i < hasta; i++) suma += audio[i] * audio[i];
  return Math.sqrt(suma / Math.max(1, hasta - desde));
}

/** Divide el audio en tramos de voz: saltea los silencios y corta en el punto más callado. */
function tramosDeVoz(audio) {
  const cuadro = Math.round(VENTANA * FRECUENCIA);
  const cantidad = Math.floor(audio.length / cuadro);
  const niveles = new Float32Array(cantidad);
  let pico = 0;
  for (let i = 0; i < cantidad; i++) {
    niveles[i] = energia(audio, i * cuadro, (i + 1) * cuadro);
    if (niveles[i] > pico) pico = niveles[i];
  }
  const umbral = Math.max(0.0015, Math.min(0.006, pico * 0.03));
  const aCuadros = (segundos) => Math.round(segundos / VENTANA);
  const margen = aCuadros(MARGEN);

  const tramos = [];
  let i = 0;
  while (i < cantidad) {
    while (i < cantidad && niveles[i] < umbral) i++;
    if (i >= cantidad) break;
    const inicio = Math.max(0, i - margen);
    const limite = inicio + aCuadros(MAX_TRAMO);
    let ultimaVoz = i;
    let j = i;
    let fin = -1;
    for (; j < cantidad && j < limite; j++) {
      if (niveles[j] >= umbral) ultimaVoz = j;
      else if (j - ultimaVoz >= aCuadros(PAUSA_CORTE)) {
        fin = ultimaVoz + margen;
        break;
      }
    }
    if (fin < 0 && j >= cantidad) fin = Math.min(cantidad, ultimaVoz + margen);
    if (fin < 0) {
      // Tramo largo sin pausas: cortar en el cuadro más callado cerca del final.
      let mejor = limite - 1;
      for (let k = inicio + aCuadros(MIN_TRAMO); k < limite; k++) {
        if (niveles[k] < niveles[mejor]) mejor = k;
      }
      fin = mejor;
    }
    tramos.push([inicio * cuadro, Math.min(audio.length, fin * cuadro)]);
    i = Math.max(fin, inicio + 1);
  }
  return tramos;
}

async function transcribir({ id, url, idioma, hablante }) {
  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error('No se pudo leer el audio preparado.');
  const audio = new Float32Array(await respuesta.arrayBuffer());
  const tramos = tramosDeVoz(audio);
  const conVoz = tramos.reduce((n, [a, b]) => n + b - a, 0) || 1;
  const segmentos = [];
  let hechas = 0;
  const comienzo = performance.now();

  for (const [inicio, fin] of tramos) {
    const pieza = audio.subarray(inicio, fin);
    const desplazamiento = inicio / FRECUENCIA;
    const largo = pieza.length / FRECUENCIA;
    const salida = await transcriptor(pieza, {
      return_timestamps: true,
      task: 'transcribe',
      ...(idioma && idioma !== 'auto' ? { language: idioma } : {}),
    });
    const partes = salida.chunks?.length ? salida.chunks : [{ text: salida.text, timestamp: [0, largo] }];
    for (const parte of partes) {
      const texto = (parte.text || '').trim();
      if (!texto || ALUCINACIONES.test(texto)) continue;
      const [a, b] = parte.timestamp || [0, largo];
      segmentos.push({
        inicio: desplazamiento + (a ?? 0),
        fin: desplazamiento + Math.min(b ?? largo, largo),
        texto,
        ...(hablante ? { hablante } : {}),
      });
    }
    hechas += fin - inicio;
    enviar({
      tipo: 'avance',
      id,
      fraccion: hechas / conVoz,
      transcurrido: (performance.now() - comienzo) / 1000,
      parcial: segmentos.slice(-3).map((s) => s.texto).join(' '),
    });
  }
  return segmentos;
}

function mensajeDeError(err) {
  const texto = err?.message || String(err);
  if (err instanceof RangeError || /allocation failed|out of memory|OOM/i.test(texto)) {
    return 'No hay memoria suficiente para este modelo. Cerrá otras apps o elegí una calidad menor.';
  }
  return texto;
}

self.addEventListener('message', async ({ data }) => {
  try {
    if (data.tipo === 'cargar') {
      await cargar(data);
      enviar({ tipo: 'listo', id: data.id });
    } else if (data.tipo === 'transcribir') {
      enviar({ tipo: 'listo', id: data.id, segmentos: await transcribir(data) });
    }
  } catch (err) {
    enviar({ tipo: 'error', id: data.id, mensaje: mensajeDeError(err) });
  }
});

// Errores dentro del motor, fuera de nuestras promesas: si no llegan, la interfaz queda esperando.
self.addEventListener('unhandledrejection', (e) => {
  e.preventDefault();
  enviar({ tipo: 'error', mensaje: mensajeDeError(e.reason) });
});
