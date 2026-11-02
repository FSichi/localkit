// Only the microphone and screen capture are granted to the renderer.
import { desktopCapturer, session } from 'electron';

const GRANTED_REQUESTS = new Set(['media', 'display-capture', 'fullscreen']);
const GRANTED_CHECKS = new Set(['media', 'display-capture']);

export function configureCapturePermissions() {
  const { defaultSession } = session;
  defaultSession.setPermissionRequestHandler((_contents, permission, respond) => respond(GRANTED_REQUESTS.has(permission)));
  defaultSession.setPermissionCheckHandler((_contents, permission) => GRANTED_CHECKS.has(permission));
  // getDisplayMedia returns the system sound (Windows loopback) without showing a picker.
  defaultSession.setDisplayMediaRequestHandler(async (_request, respond) => {
    const screens = await desktopCapturer.getSources({ types: ['screen'] });
    respond({ video: screens[0], audio: 'loopback' });
  });
}
