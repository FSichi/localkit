// Biblioteca: cada transcripción o grabación es un JSON en la carpeta de datos del usuario.
import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { contarPalabras } from '../shared/formato.ts';
import type { Item, ResumenItem } from '../shared/tipos.ts';

function carpeta(): string {
  const ruta = join(app.getPath('userData'), 'biblioteca');
  mkdirSync(ruta, { recursive: true });
  return ruta;
}

const rutaItem = (id: string) => join(carpeta(), `${id.replace(/[^\w-]/g, '')}.json`);

export function crearItem(datos: Omit<Item, 'id'>): Item {
  const item: Item = { id: randomUUID(), ...datos };
  guardarItem(item);
  return item;
}

export function guardarItem(item: Item): void {
  writeFileSync(rutaItem(item.id), JSON.stringify(item));
}

export function obtenerItem(id: string): Item {
  return JSON.parse(readFileSync(rutaItem(id), 'utf8'));
}

export function actualizarItem(id: string, cambios: Partial<Item>): Item {
  const item = { ...obtenerItem(id), ...cambios, id };
  guardarItem(item);
  return item;
}

function todos(): Item[] {
  const items: Item[] = [];
  for (const archivo of readdirSync(carpeta())) {
    if (!archivo.endsWith('.json')) continue;
    try {
      items.push(JSON.parse(readFileSync(join(carpeta(), archivo), 'utf8')));
    } catch {
      // Un JSON dañado no debe tapar el resto de la biblioteca.
    }
  }
  return items.sort((a, b) => b.creado.localeCompare(a.creado));
}

function fragmentoCon(item: Item, q: string): string | undefined {
  const seg = item.segmentos.find((s) => s.texto.toLowerCase().includes(q));
  if (!seg) return undefined;
  const pos = seg.texto.toLowerCase().indexOf(q);
  const desde = Math.max(0, pos - 50);
  return (desde ? '…' : '') + seg.texto.slice(desde, pos + q.length + 90);
}

export function listarItems(busqueda = ''): ResumenItem[] {
  const q = busqueda.trim().toLowerCase();
  const resultado: ResumenItem[] = [];
  for (const item of todos()) {
    const fragmento = q ? fragmentoCon(item, q) : undefined;
    if (q && !fragmento && !item.titulo.toLowerCase().includes(q)) continue;
    const { segmentos, ...resto } = item;
    resultado.push({ ...resto, palabras: contarPalabras(segmentos), fragmento });
  }
  return resultado;
}

/** Quita el item. Una grabación borra también su carpeta; un archivo del usuario nunca se toca. */
export function eliminarItem(id: string): void {
  const item = obtenerItem(id);
  if (item.tipo === 'grabacion' && item.carpeta) rmSync(item.carpeta, { recursive: true, force: true });
  rmSync(rutaItem(id), { force: true });
}
