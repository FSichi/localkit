// Custom protocol serving the UI, models, temporary audio and user files.
// It gives the renderer a secure context (WebGPU, module workers) and supports seeking in media.
import { protocol } from 'electron';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { Readable } from 'node:stream';
import { APP_SCHEME } from '../../shared/app-scheme.ts';

export { APP_SCHEME };

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/mp4',
  '.mkv': 'video/x-matroska',
};

// Cross-origin isolation enables multiple threads in CPU mode.
const COMMON_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

type PathResolver = (relativePath: string) => string | null;

const resolvers = new Map<string, PathResolver>();
const allowedMedia = new Set<string>();

/** Serves a folder under a host, refusing anything that escapes it. */
export function serveFolder(host: string, folderForPath: (relativePath: string) => { root: string; path: string }) {
  resolvers.set(host, (relativePath) => {
    const { root, path } = folderForPath(relativePath);
    const resolved = normalize(join(root, path));
    return resolved === root || resolved.startsWith(root + sep) ? resolved : null;
  });
}

/** User files are served only after being explicitly allowed. */
export function mediaUrlFor(path: string): string {
  allowedMedia.add(normalize(path).toLowerCase());
  return `${APP_SCHEME}://media/${encodeURIComponent(path)}`;
}

function serveFile(path: string, request: Request): Response {
  if (!existsSync(path) || !statSync(path).isFile()) return new Response('Not found', { status: 404, headers: COMMON_HEADERS });
  const size = statSync(path).size;
  const contentType = CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
  const range = request.headers.get('range')?.match(/bytes=(\d*)-(\d*)/);

  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size) return new Response(null, { status: 416, headers: { ...COMMON_HEADERS, 'Content-Range': `bytes */${size}` } });
    return new Response(Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream, {
      status: 206,
      headers: {
        ...COMMON_HEADERS,
        'Content-Type': contentType,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
      },
    });
  }
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    headers: { ...COMMON_HEADERS, 'Content-Type': contentType, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' },
  });
}

export function registerSchemePrivileges() {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  ]);
}

export function registerProtocolHandler() {
  resolvers.set('media', (relativePath) => {
    const path = normalize(relativePath);
    return allowedMedia.has(path.toLowerCase()) ? path : null;
  });
  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const path = resolvers.get(url.host)?.(relativePath) ?? null;
    if (!path) return new Response('Forbidden', { status: 403, headers: COMMON_HEADERS });
    return serveFile(path, request);
  });
}
