// Main window: creation, title bar colors and navigation guards.
import { app, BrowserWindow, nativeTheme, shell } from 'electron';
import { join } from 'node:path';
import type { Theme } from '../../shared/settings.ts';
import { t } from '../../shared/i18n/index.ts';
import { APP_SCHEME } from './protocol.ts';

const TITLE_BAR_HEIGHT = 40;
const TITLE_BAR_COLORS = {
  dark: { background: '#0D0E10', symbols: '#A0A5AD' },
  light: { background: '#F7F7F8', symbols: '#4E535C' },
};
const NATIVE_THEME: Record<Theme, 'dark' | 'light' | 'system'> = { dark: 'dark', light: 'light', system: 'system' };

function titleBarColors(theme: Theme) {
  const dark = theme === 'system' ? nativeTheme.shouldUseDarkColors : theme === 'dark';
  return dark ? TITLE_BAR_COLORS.dark : TITLE_BAR_COLORS.light;
}

export function applyNativeTheme(theme: Theme) {
  nativeTheme.themeSource = NATIVE_THEME[theme];
}

export function applyWindowTheme(window: BrowserWindow, theme: Theme) {
  applyNativeTheme(theme);
  const colors = titleBarColors(theme);
  window.setBackgroundColor(colors.background);
  window.setTitleBarOverlay({ color: colors.background, symbolColor: colors.symbols, height: TITLE_BAR_HEIGHT });
}

export function createMainWindow(theme: Theme, canClose: (window: BrowserWindow) => boolean): BrowserWindow {
  const colors = titleBarColors(theme);
  const devServerUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 860,
    minHeight: 560,
    show: false,
    title: t.app.name,
    // Once installed, the window uses the icon of the executable.
    ...(app.isPackaged ? {} : { icon: join(__dirname, '../../build/icon.png') }),
    backgroundColor: colors.background,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: colors.background, symbolColor: colors.symbols, height: TITLE_BAR_HEIGHT },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      // Recording and transcription must keep going while minimized.
      backgroundThrottling: false,
    },
  });

  window.once('ready-to-show', () => window.show());
  window.on('close', (event) => {
    if (!canClose(window)) event.preventDefault();
  });

  // External links open in the browser, never inside the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${APP_SCHEME}://app`) && !(devServerUrl && url.startsWith(devServerUrl))) event.preventDefault();
  });

  window.loadURL(devServerUrl || `${APP_SCHEME}://app/index.html`);
  return window;
}
