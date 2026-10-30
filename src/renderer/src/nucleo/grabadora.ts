// Grabadora: captura el sonido de la PC y el micrófono, y manda el audio a disco cada segundo.
//
// Las dos fuentes van en una sola pista estéreo: izquierda = micrófono, derecha = sistema. Comparten
// el reloj del AudioContext, así quedan perfectamente sincronizadas y, al transcribirlas por separado,
// se sabe quién dijo qué. El AudioContext además rellena con silencio cuando no suena nada, por lo
// que el tiempo de la grabación coincide siempre con el tiempo real.
import type { Fuente } from '../../../shared/tipos.ts';
import { app, avisar, bibliotecaCambio, ir } from './app.ts';
import { agregarItem } from './cola.ts';
import { crearTienda } from './tienda.ts';

const MUESTRAS_HISTORIAL = 160;
const TICK_MS = 50;

export interface EstadoGrabadora {
  estado: 'inactiva' | 'iniciando' | 'grabando' | 'pausada' | 'guardando';
  segundos: number;
  fuente: Fuente;
}

export const grabadora = crearTienda<EstadoGrabadora>({ estado: 'inactiva', segundos: 0, fuente: 'ambos' });

/** Últimos niveles de cada fuente (0 a 1), para dibujar la onda sin pasar por React. */
export const historial = { sistema: new Float32Array(MUESTRAS_HISTORIAL), mic: new Float32Array(MUESTRAS_HISTORIAL) };

interface Sesion {
  id: string;
  flujos: MediaStream[];
  ctx: AudioContext;
  grabador: MediaRecorder;
  envios: Promise<void>;
  acumulado: number;
  desde: number;
  tick: number;
}

let sesion: Sesion | null = null;

function errorLegible(err: unknown, parte: string): Error {
  const nombre = (err as DOMException)?.name;
  if (nombre === 'NotAllowedError') {
    return new Error(parte === 'mic' ? 'Windows no le da permiso de micrófono a la app. Revisalo en Configuración > Privacidad > Micrófono.' : 'No se pudo capturar el sonido de la PC.');
  }
  if (nombre === 'NotFoundError') return new Error('No se encontró ese micrófono.');
  return new Error((err as Error)?.message || 'No se pudo iniciar la grabación.');
}

async function capturarSistema(): Promise<MediaStream> {
  let flujo: MediaStream;
  try {
    flujo = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
  } catch (err) {
    throw errorLegible(err, 'sistema');
  }
  // El video solo se pide porque la API lo exige.
  flujo.getVideoTracks().forEach((pista) => pista.stop());
  if (!flujo.getAudioTracks().length) throw new Error('No se pudo capturar el sonido de la PC.');
  return new MediaStream(flujo.getAudioTracks());
}

async function capturarMic(micId: string): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: micId && micId !== 'default' ? { exact: micId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (err) {
    throw errorLegible(err, 'mic');
  }
}

function medir(analizador: AnalyserNode | null, buffer: Float32Array<ArrayBuffer>): number {
  if (!analizador) return 0;
  analizador.getFloatTimeDomainData(buffer);
  let suma = 0;
  for (const v of buffer) suma += v * v;
  return Math.min(1, Math.sqrt(suma / buffer.length) * 3.5);
}

function empujar(lista: Float32Array, valor: number) {
  lista.copyWithin(0, 1);
  lista[lista.length - 1] = valor;
}

const segundosGrabados = (s: Sesion) => s.acumulado + (s.desde ? (performance.now() - s.desde) / 1000 : 0);

export async function iniciarGrabacion() {
  if (grabadora.leer().estado !== 'inactiva') return;
  const { fuente, micId } = app.leer().ajustes;
  grabadora.poner({ estado: 'iniciando', segundos: 0, fuente });
  historial.sistema.fill(0);
  historial.mic.fill(0);

  const flujos: MediaStream[] = [];
  let ctx: AudioContext | null = null;
  try {
    const sistema = fuente !== 'mic' ? await capturarSistema() : null;
    if (sistema) flujos.push(sistema);
    const mic = fuente !== 'sistema' ? await capturarMic(micId) : null;
    if (mic) flujos.push(mic);

    ctx = new AudioContext({ sampleRate: 48000 });
    await ctx.resume();
    const union = ctx.createChannelMerger(2);
    const destino = ctx.createMediaStreamDestination();
    destino.channelCount = 2;
    union.connect(destino);

    const conectar = (flujo: MediaStream | null, canal: number) => {
      if (!flujo) return null;
      const origen = ctx!.createMediaStreamSource(flujo);
      origen.connect(union, 0, canal);
      const analizador = ctx!.createAnalyser();
      analizador.fftSize = 1024;
      origen.connect(analizador);
      return analizador;
    };
    const medidorMic = conectar(mic, 0);
    const medidorSistema = conectar(sistema, 1);

    const { id } = await window.api.iniciarGrabacion(fuente);
    const grabador = new MediaRecorder(destino.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
    const nueva: Sesion = { id, flujos, ctx, grabador, envios: Promise.resolve(), acumulado: 0, desde: performance.now(), tick: 0 };
    // Las escrituras se encadenan para que los fragmentos lleguen en orden.
    grabador.addEventListener('dataavailable', (e) => {
      if (!e.data.size) return;
      nueva.envios = nueva.envios.then(async () => window.api.enviarFragmento(id, new Uint8Array(await e.data.arrayBuffer())));
    });
    grabador.start(1000);
    sesion = nueva;

    const buffer = new Float32Array(1024);
    nueva.tick = window.setInterval(() => {
      if (grabadora.leer().estado === 'grabando') {
        empujar(historial.sistema, medir(medidorSistema, buffer));
        empujar(historial.mic, medir(medidorMic, buffer));
      }
      const segundos = Math.floor(segundosGrabados(nueva));
      if (segundos !== grabadora.leer().segundos) grabadora.poner({ segundos });
    }, TICK_MS);

    // Si la fuente desaparece (se desconecta el micrófono, por ejemplo), se guarda lo que hay.
    flujos.flatMap((f) => f.getAudioTracks()).forEach((pista) => pista.addEventListener('ended', () => {
      if (sesion === nueva) {
        avisar('Se cortó una fuente de audio. Guardé lo grabado.');
        detenerGrabacion();
      }
    }));
    grabadora.poner({ estado: 'grabando' });
  } catch (err) {
    flujos.forEach((f) => f.getTracks().forEach((p) => p.stop()));
    ctx?.close();
    grabadora.poner({ estado: 'inactiva' });
    avisar((err as Error).message, { tipo: 'error' });
  }
}

export function pausarGrabacion() {
  const s = sesion;
  if (!s) return;
  if (s.grabador.state === 'recording') {
    s.grabador.pause();
    s.acumulado = segundosGrabados(s);
    s.desde = 0;
    grabadora.poner({ estado: 'pausada' });
  } else if (s.grabador.state === 'paused') {
    s.grabador.resume();
    s.desde = performance.now();
    grabadora.poner({ estado: 'grabando' });
  }
}

async function cerrarSesion(s: Sesion) {
  clearInterval(s.tick);
  await new Promise<void>((resolver) => {
    s.grabador.addEventListener('stop', () => resolver(), { once: true });
    s.grabador.stop();
  });
  s.flujos.forEach((f) => f.getTracks().forEach((p) => p.stop()));
  await s.envios;
  s.ctx.close();
}

export async function detenerGrabacion() {
  const s = sesion;
  if (!s) return;
  sesion = null;
  const duracion = segundosGrabados(s);
  grabadora.poner({ estado: 'guardando' });
  await cerrarSesion(s);
  try {
    const item = await window.api.terminarGrabacion(s.id, duracion);
    bibliotecaCambio();
    if (app.leer().ajustes.transcribirAlTerminar) {
      agregarItem(item);
      avisar('Grabación guardada. Transcribiendo…');
    } else {
      avisar('Grabación guardada', { accion: { texto: 'Abrir', hacer: () => ir({ pagina: 'detalle', id: item.id }) } });
    }
  } catch (err) {
    avisar((err as Error).message, { tipo: 'error' });
  }
  grabadora.poner({ estado: 'inactiva', segundos: 0 });
}

export async function descartarGrabacion() {
  const s = sesion;
  if (!s) return;
  sesion = null;
  grabadora.poner({ estado: 'guardando' });
  await cerrarSesion(s);
  await window.api.descartarGrabacion(s.id);
  grabadora.poner({ estado: 'inactiva', segundos: 0 });
  avisar('Grabación descartada');
}
