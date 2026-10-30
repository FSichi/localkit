// Modelos de IA: se bajan de Hugging Face a una carpeta real, con reanudación si se corta la red.
import { app, net } from 'electron';
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { MODELOS, modeloPorId } from '../shared/modelos.ts';
import type { EstadoModelo, Perfil, ProgresoDescarga } from '../shared/tipos.ts';

const REINTENTOS = 4;

export function carpetaModelos(): string {
  const ruta = join(app.getPath('userData'), 'modelos');
  mkdirSync(ruta, { recursive: true });
  return ruta;
}

export const rutaModelo = (id: string) => join(carpetaModelos(), ...id.split('/'));

function tamanoCarpeta(ruta: string): number {
  if (!existsSync(ruta)) return 0;
  let bytes = 0;
  for (const entrada of readdirSync(ruta, { withFileTypes: true })) {
    const hija = join(ruta, entrada.name);
    bytes += entrada.isDirectory() ? tamanoCarpeta(hija) : statSync(hija).size;
  }
  return bytes;
}

export function estadoModelos(perfil: Perfil): EstadoModelo[] {
  return MODELOS.map((m) => {
    const archivos = m.archivos[perfil];
    const descargado = archivos.length > 0 && archivos.every((a) => existsSync(join(rutaModelo(m.id), a)));
    return { id: m.id, descargado, bytes: tamanoCarpeta(rutaModelo(m.id)) };
  });
}

async function bajarArchivo(url: string, destino: string, alAvanzar: (bytes: number) => void, senal: AbortSignal) {
  const parte = `${destino}.part`;
  mkdirSync(dirname(destino), { recursive: true });
  let yaBajado = existsSync(parte) ? statSync(parte).size : 0;

  const respuesta = await net.fetch(url, { signal: senal, headers: yaBajado ? { Range: `bytes=${yaBajado}-` } : {} });
  if (respuesta.status === 416) {
    // El .part ya está completo o quedó inválido: se empieza de cero.
    rmSync(parte, { force: true });
    return bajarArchivo(url, destino, alAvanzar, senal);
  }
  if (!respuesta.ok || !respuesta.body) throw new Error(`Hugging Face respondió ${respuesta.status}`);
  if (respuesta.status === 200) yaBajado = 0;
  alAvanzar(yaBajado);

  const escritura = createWriteStream(parte, { flags: yaBajado ? 'a' : 'w' });
  try {
    const lector = respuesta.body.getReader();
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      alAvanzar(value.byteLength);
      if (!escritura.write(value)) await new Promise((r) => escritura.once('drain', r));
    }
  } finally {
    await new Promise((r) => escritura.end(r));
  }
  renameSync(parte, destino);
}

const descargas = new Map<string, AbortController>();

export async function descargarModelo(id: string, perfil: Perfil, avisar: (p: ProgresoDescarga) => void) {
  const modelo = modeloPorId(id);
  const control = new AbortController();
  descargas.set(id, control);
  const archivos = modelo.archivos[perfil].filter((a) => !existsSync(join(rutaModelo(id), a)));
  const total = modelo.bytes[perfil];
  let hechos = modelo.archivos[perfil]
    .filter((a) => existsSync(join(rutaModelo(id), a)))
    .reduce((n, a) => n + statSync(join(rutaModelo(id), a)).size, 0);

  let ultimo = 0;
  const alAvanzar = (bytes: number) => {
    hechos += bytes;
    if (hechos - ultimo > 2e6) {
      ultimo = hechos;
      avisar({ modelo: id, hechos: Math.min(hechos, total), total });
    }
  };

  try {
    for (const archivo of archivos) {
      const url = `https://huggingface.co/${id}/resolve/main/${archivo}`;
      for (let intento = 1; ; intento++) {
        const antes = hechos;
        try {
          await bajarArchivo(url, join(rutaModelo(id), archivo), alAvanzar, control.signal);
          break;
        } catch (err) {
          if (control.signal.aborted) throw err;
          if (intento >= REINTENTOS) throw new Error('No se pudo descargar el modelo. Revisá tu conexión a internet.');
          // Lo ya bajado queda en el .part y se vuelve a contar al reanudar.
          hechos = antes;
          await new Promise((r) => setTimeout(r, 1500 * intento));
        }
      }
    }
    avisar({ modelo: id, hechos: total, total });
  } finally {
    descargas.delete(id);
  }
}

export function cancelarDescarga(id: string) {
  descargas.get(id)?.abort();
}

export function borrarModelo(id: string) {
  rmSync(rutaModelo(id), { recursive: true, force: true });
}
