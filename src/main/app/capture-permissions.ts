// Only the microphone and screen capture are granted to the renderer.
import { desktopCapturer, session } from 'electron';
import type { CaptureSource } from '../../shared/transcription.ts';
import { handle } from './ipc.ts';

const GRANTED_REQUESTS = new Set(['media', 'display-capture', 'fullscreen']);
const GRANTED_CHECKS = new Set(['media', 'display-capture']);
const THUMBNAIL_SIZE = { width: 320, height: 180 };
const THUMBNAIL_QUALITY = 70;

let selectedSourceId: string | null = null;

async function listSources(): Promise<CaptureSource[]> {
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: THUMBNAIL_SIZE });
  return sources
    .filter(({ name, thumbnail }) => name && !thumbnail.isEmpty())
    .map(({ id, name, thumbnail }) => ({
      id,
      name,
      isScreen: id.startsWith('screen:'),
      thumbnail: `data:image/jpeg;base64,${thumbnail.toJPEG(THUMBNAIL_QUALITY).toString('base64')}`,
    }));
}

export function registerCaptureIpc() {
  handle('capture:listSources', listSources);
  handle('capture:selectSource', (id) => {
    selectedSourceId = id;
  });
}

export function configureCapturePermissions() {
  const { defaultSession } = session;
  defaultSession.setPermissionRequestHandler((_contents, permission, respond) => respond(GRANTED_REQUESTS.has(permission)));
  defaultSession.setPermissionCheckHandler((_contents, permission) => GRANTED_CHECKS.has(permission));
  // getDisplayMedia returns the chosen source and the system sound (Windows loopback) without showing
  // a picker: the app has its own.
  defaultSession.setDisplayMediaRequestHandler(async ({ audioRequested }, respond) => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    const video = sources.find(({ id }) => id === selectedSourceId) ?? sources.find(({ id }) => id.startsWith('screen:'));
    respond({ video, ...(audioRequested ? { audio: 'loopback' as const } : {}) });
  });
}
