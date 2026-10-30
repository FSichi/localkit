// Motor de transcripción: habla con el worker de Whisper y prepara el modelo.
import { modeloPorId } from '../../../shared/modelos.ts';
import type { Hablante, Perfil, Segmento } from '../../../shared/tipos.ts';

interface Pendiente {
  resolver: (datos: any) => void;
  rechazar: (err: Error) => void;
  alEvento?: (datos: any) => void;
}

export class Cancelado extends Error {}

let worker: Worker | null = null;
let cargado: string | null = null;
let pendiente: Pendiente | null = null;
let contador = 0;

function cerrarPendiente(fn: (p: Pendiente) => void) {
  const p = pendiente;
  pendiente = null;
  if (p) fn(p);
}

function obtenerWorker(): Worker {
  if (worker) return worker;
  // Ruta relativa a la página: el worker vive en public/ y no pasa por el bundler.
  worker = new Worker(new URL('motor/whisper-worker.js', document.baseURI), { type: 'module' });
  worker.addEventListener('message', ({ data }) => {
    if (data.tipo === 'listo') cerrarPendiente((p) => p.resolver(data));
    else if (data.tipo === 'error') cerrarPendiente((p) => p.rechazar(new Error(data.mensaje)));
    else pendiente?.alEvento?.(data);
  });
  worker.addEventListener('error', (e) => {
    cerrarPendiente((p) => p.rechazar(new Error(e.message || 'Falló el motor de transcripción.')));
  });
  return worker;
}

function pedir<T>(mensaje: object, alEvento?: (datos: any) => void): Promise<T> {
  return new Promise((resolver, rechazar) => {
    pendiente = { resolver, rechazar, alEvento };
    obtenerWorker().postMessage({ ...mensaje, id: ++contador });
  });
}

export function detenerMotor() {
  worker?.terminate();
  worker = null;
  cargado = null;
  cerrarPendiente((p) => p.rechazar(new Cancelado()));
}

export async function cargarModelo(id: string, perfil: Perfil, alCargar: (fraccion: number) => void) {
  const clave = `${id}|${perfil}`;
  if (cargado === clave) return;
  await pedir({ tipo: 'cargar', modelo: id, perfil, dtype: modeloPorId(id).dtype[perfil] }, (d) => {
    if (d.tipo === 'carga') alCargar(d.fraccion);
  });
  cargado = clave;
}

export const modeloCargado = (id: string) => cargado?.startsWith(`${id}|`) ?? false;

export interface Avance {
  fraccion: number;
  transcurrido: number;
  parcial: string;
}

export async function transcribirPista(url: string, idioma: string, hablante: Hablante | undefined, alAvanzar: (a: Avance) => void) {
  const { segmentos } = await pedir<{ segmentos: Segmento[] }>({ tipo: 'transcribir', url, idioma, hablante }, (d) => {
    if (d.tipo === 'avance') alAvanzar(d);
  });
  return segmentos;
}
