// Graba a disco a medida que llega el audio: si la app o la PC se caen, lo grabado no se pierde.
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync, createWriteStream, readFileSync, type WriteStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { leerAjustes } from './ajustes.ts';
import { crearItem, listarItems } from './biblioteca.ts';
import { generarMp3, prepararPistas, limpiarTrabajo } from './medios.ts';
import type { Fuente, GrabacionIniciada, Item } from '../shared/tipos.ts';

const PISTAS = 'pistas.webm';
const AUDIO = 'grabacion.mp3';
const MARCA = 'en-curso.json';

interface Activa {
  id: string;
  carpeta: string;
  fuente: Fuente;
  inicio: Date;
  salida: WriteStream;
}

let activa: Activa | null = null;

const raiz = () => join(leerAjustes().carpetaGrabaciones, 'Grabaciones');

function nombreCarpeta(fecha: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  const base = `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())} ${dos(fecha.getHours())}.${dos(fecha.getMinutes())}`;
  let nombre = base;
  for (let i = 2; existsSync(join(raiz(), nombre)); i++) nombre = `${base} (${i})`;
  return nombre;
}

function tituloGrabacion(fecha: Date): string {
  const dia = fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `Grabación ${dia}, ${hora}`;
}

export const hayGrabacionActiva = () => activa !== null;

export function iniciarGrabacion(fuente: Fuente): GrabacionIniciada {
  if (activa) throw new Error('Ya hay una grabación en curso.');
  const inicio = new Date();
  const carpeta = join(raiz(), nombreCarpeta(inicio));
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, MARCA), JSON.stringify({ fuente, inicio: inicio.toISOString() }));
  activa = { id: randomUUID(), carpeta, fuente, inicio, salida: createWriteStream(join(carpeta, PISTAS)) };
  return { id: activa.id, carpeta };
}

export function escribirFragmento(id: string, datos: Uint8Array) {
  if (activa?.id === id) activa.salida.write(Buffer.from(datos));
}

async function cerrarSalida(a: Activa) {
  await new Promise<void>((resolver) => a.salida.end(resolver));
}

async function finalizarCarpeta(carpeta: string, fuente: Fuente, inicio: Date, duracion: number): Promise<Item> {
  const pistas = join(carpeta, PISTAS);
  const audio = join(carpeta, AUDIO);
  await generarMp3(`mp3-${randomUUID()}`, pistas, fuente, audio);
  const item = crearItem({
    titulo: tituloGrabacion(inicio),
    tipo: 'grabacion',
    creado: inicio.toISOString(),
    duracion,
    audio,
    pistas,
    carpeta,
    fuente,
    estado: 'pendiente',
    segmentos: [],
  });
  rmSync(join(carpeta, MARCA), { force: true });
  return item;
}

export async function terminarGrabacion(id: string, duracion: number): Promise<Item> {
  if (activa?.id !== id) throw new Error('No hay una grabación en curso.');
  const a = activa;
  activa = null;
  await cerrarSalida(a);
  return finalizarCarpeta(a.carpeta, a.fuente, a.inicio, duracion);
}

export async function descartarGrabacion(id: string) {
  if (activa?.id !== id) return;
  const a = activa;
  activa = null;
  await cerrarSalida(a);
  rmSync(a.carpeta, { recursive: true, force: true });
}

/** Grabaciones que quedaron sin cerrar (se cerró la app o se cortó la luz): se rescatan al abrir. */
export async function recuperarGrabaciones(): Promise<number> {
  if (activa || !existsSync(raiz())) return 0;
  const conocidas = new Set(listarItems().map((i) => i.carpeta));
  let recuperadas = 0;
  for (const entrada of readdirSync(raiz(), { withFileTypes: true })) {
    const carpeta = join(raiz(), entrada.name);
    if (!entrada.isDirectory() || conocidas.has(carpeta) || !existsSync(join(carpeta, MARCA))) continue;
    const pistas = join(carpeta, PISTAS);
    if (!existsSync(pistas) || statSync(pistas).size === 0) continue;
    try {
      const marca = JSON.parse(readFileSync(join(carpeta, MARCA), 'utf8'));
      const trabajo = `rescate-${randomUUID()}`;
      const [pista] = await prepararPistas(trabajo, pistas, undefined, () => {});
      limpiarTrabajo(trabajo);
      await finalizarCarpeta(carpeta, marca.fuente, new Date(marca.inicio), pista.duracion);
      recuperadas++;
    } catch (err) {
      console.error('No se pudo recuperar la grabación', carpeta, err);
    }
  }
  return recuperadas;
}
