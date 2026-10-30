// Busca versiones nuevas en los releases de GitHub y actualiza la app instalada.
// Junto con la descarga de modelos, es lo único que la app consulta en internet, y se puede desactivar.
import { app, net } from 'electron';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, mkdirSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compararVersiones, parseSecciones } from '../shared/changelog.ts';
import type { EstadoActualizacion, InfoActualizacion, VersionPublicada } from '../shared/tipos.ts';
import { hayGrabacionActiva } from './grabador.ts';

export const REPO = 'FSichi/transcriptor-desktop';
const CACHE_MS = 6 * 60 * 60 * 1000;

let cache: { hasta: number; datos: InfoActualizacion } | null = null;

interface ReleaseGitHub {
  tag_name?: string;
  name?: string;
  body?: string;
  published_at?: string;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: { name: string; browser_download_url: string; size: number }[];
}

function aVersion(r: ReleaseGitHub): VersionPublicada {
  const archivo = (re: RegExp) => {
    const a = (r.assets ?? []).find((x) => re.test(x.name));
    return a ? { nombre: a.name, url: a.browser_download_url, tamano: a.size } : null;
  };
  return {
    version: String(r.tag_name ?? '').replace(/^v/i, ''),
    fecha: r.published_at ?? null,
    url: r.html_url,
    secciones: parseSecciones(r.body ?? ''),
    instalador: archivo(/^Transcriptor-Setup-.+\.exe$/i),
    sha256: archivo(/^Transcriptor-Setup-.+\.exe\.sha256$/i),
  };
}

export async function buscarActualizacion(forzar = false): Promise<InfoActualizacion> {
  if (!forzar && cache && Date.now() < cache.hasta) return cache.datos;
  const respuesta = await net.fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, {
    headers: { 'User-Agent': `Transcriptor/${app.getVersion()}`, Accept: 'application/vnd.github+json' },
  });
  if (!respuesta.ok) throw new Error(`GitHub respondió ${respuesta.status}.`);
  const releases = (await respuesta.json()) as ReleaseGitHub[];
  const versiones = releases
    .filter((r) => !r.draft && !r.prerelease && /^v?\d+\.\d+\.\d+/.test(r.tag_name ?? ''))
    .map(aVersion)
    .sort((a, b) => compararVersiones(b.version, a.version));
  const ultima = versiones[0] ?? null;
  const datos: InfoActualizacion = {
    actual: app.getVersion(),
    ultima,
    hayNueva: Boolean(ultima && compararVersiones(ultima.version, app.getVersion()) > 0),
    instalada: app.isPackaged,
  };
  cache = { hasta: Date.now() + CACHE_MS, datos };
  return datos;
}

/**
 * Baja el instalador, verifica su SHA-256 contra el publicado en el mismo release, lo ejecuta en
 * silencio y cierra la app. El instalador reemplaza los archivos y la vuelve a abrir (--force-run).
 * Nunca toca la biblioteca, las grabaciones ni los modelos, que viven fuera de la carpeta de la app.
 */
export async function actualizar(avisar: (e: EstadoActualizacion) => void) {
  if (!app.isPackaged) throw new Error('Esta copia no está instalada: bajá la versión nueva desde GitHub.');
  if (hayGrabacionActiva()) throw new Error('Terminá la grabación antes de actualizar.');
  const info = await buscarActualizacion(true);
  if (!info.hayNueva || !info.ultima) throw new Error('Ya tenés la última versión.');
  const { instalador, sha256 } = info.ultima;
  if (!instalador || !sha256) throw new Error('El release no tiene el instalador o su SHA-256.');

  const carpeta = join(tmpdir(), 'Transcriptor-actualizacion');
  mkdirSync(carpeta, { recursive: true });
  const destino = join(carpeta, instalador.nombre);
  const temporal = `${destino}.descarga`;

  const respuesta = await net.fetch(instalador.url);
  if (!respuesta.ok || !respuesta.body) throw new Error(`No se pudo bajar el instalador (${respuesta.status}).`);
  const hash = createHash('sha256');
  const salida = createWriteStream(temporal);
  let bytes = 0;
  let ultimo = 0;
  try {
    const lector = respuesta.body.getReader();
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      hash.update(value);
      bytes += value.byteLength;
      if (!salida.write(value)) await new Promise((r) => salida.once('drain', r));
      if (bytes - ultimo > 1e6) {
        ultimo = bytes;
        avisar({ fase: 'descargando', bytes, total: instalador.tamano });
      }
    }
  } finally {
    await new Promise((r) => salida.end(r));
  }

  avisar({ fase: 'verificando', bytes, total: instalador.tamano });
  const textoSha = await (await net.fetch(sha256.url)).text();
  const esperado = textoSha.trim().split(/\s+/)[0].toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(esperado) || hash.digest('hex') !== esperado) {
    throw new Error('El instalador descargado no coincide con el SHA-256 publicado: no se instaló nada.');
  }
  renameSync(temporal, destino);

  avisar({ fase: 'instalando', bytes, total: instalador.tamano });
  spawn(destino, ['/S', '--force-run', '--updated'], { detached: true, stdio: 'ignore' }).unref();
  // Se cierra para que el instalador pueda reemplazar los archivos.
  setTimeout(() => app.quit(), 1500);
}
