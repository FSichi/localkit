// Protocolo propio: sirve la interfaz, los modelos, el audio temporal y los archivos de audio.
// Es lo que permite usar WebGPU y workers (contexto seguro) y saltar a cualquier punto del audio.
import { protocol } from 'electron';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { Readable } from 'node:stream';
import { rutaModelo } from './modelos.ts';
import { carpetaTemporal } from './medios.ts';

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm',
  '.mp4': 'video/mp4',
};

// Aislamiento entre orígenes: habilita varios hilos en el modo sin placa de video.
const CABECERAS = {
  'Access-Control-Allow-Origin': '*',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

const permitidos = new Set<string>();

export function permitirAudio(ruta: string | undefined) {
  if (ruta) permitidos.add(normalize(ruta).toLowerCase());
}

function responderArchivo(ruta: string, pedido: Request): Response {
  if (!existsSync(ruta) || !statSync(ruta).isFile()) return new Response('No encontrado', { status: 404, headers: CABECERAS });
  const tamano = statSync(ruta).size;
  const tipo = TIPOS[extname(ruta).toLowerCase()] ?? 'application/octet-stream';
  const rango = pedido.headers.get('range')?.match(/bytes=(\d*)-(\d*)/);

  if (rango && (rango[1] || rango[2])) {
    const inicio = rango[1] ? Number(rango[1]) : Math.max(0, tamano - Number(rango[2]));
    const fin = rango[1] && rango[2] ? Math.min(Number(rango[2]), tamano - 1) : tamano - 1;
    if (inicio >= tamano) return new Response(null, { status: 416, headers: { ...CABECERAS, 'Content-Range': `bytes */${tamano}` } });
    return new Response(Readable.toWeb(createReadStream(ruta, { start: inicio, end: fin })) as ReadableStream, {
      status: 206,
      headers: {
        ...CABECERAS,
        'Content-Type': tipo,
        'Content-Length': String(fin - inicio + 1),
        'Content-Range': `bytes ${inicio}-${fin}/${tamano}`,
        'Accept-Ranges': 'bytes',
      },
    });
  }
  return new Response(Readable.toWeb(createReadStream(ruta)) as ReadableStream, {
    headers: { ...CABECERAS, 'Content-Type': tipo, 'Content-Length': String(tamano), 'Accept-Ranges': 'bytes' },
  });
}

/** Une una ruta pedida a una carpeta base, rechazando que se salga de ella. */
function dentroDe(base: string, relativa: string): string | null {
  const ruta = normalize(join(base, relativa));
  return ruta === base || ruta.startsWith(base + sep) ? ruta : null;
}

export function registrarEsquema() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'transcriptor', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  ]);
}

export function registrarProtocolo(carpetaInterfaz: string) {
  protocol.handle('transcriptor', (pedido) => {
    const url = new URL(pedido.url);
    const relativa = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    let ruta: string | null = null;

    if (url.host === 'app') {
      ruta = dentroDe(carpetaInterfaz, relativa || 'index.html');
    } else if (url.host === 'modelos') {
      const [org, repo, ...resto] = relativa.split('/');
      ruta = dentroDe(rutaModelo(`${org}/${repo}`), resto.join('/'));
    } else if (url.host === 'temp') {
      ruta = dentroDe(carpetaTemporal(), relativa);
    } else if (url.host === 'media') {
      const pedida = normalize(relativa);
      if (permitidos.has(pedida.toLowerCase())) ruta = pedida;
    }

    if (!ruta) return new Response('Prohibido', { status: 403, headers: CABECERAS });
    return responderArchivo(ruta, pedido);
  });
}
