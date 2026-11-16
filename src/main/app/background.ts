// Keeps the app working with its window closed: in the notification area while there is work going on,
// or always when the user chooses it. Quitting is only possible from there, and asks first if it would
// stop something.
import { app, dialog, Menu, nativeImage, Notification, Tray, type BrowserWindow, type NativeImage } from 'electron';
import { join } from 'node:path';
import { t } from '../../shared/i18n/index.ts';
import type { AppRoute } from '../../shared/ipc.ts';
import { handle, listen, type AppContext } from './ipc.ts';
import { readSettings } from './settings-store.ts';

let tray: Tray | null = null;
let icon: NativeImage | null = null;
/** Transcribing, reading text or processing files: reported by the UI, which runs most of it. */
let uiBusy = false;
let quitting = false;
let toldAboutBackground = false;

async function appIcon(): Promise<NativeImage> {
  // Once installed, the executable carries the icon.
  icon ??= app.isPackaged ? await app.getFileIcon(process.execPath, { size: 'normal' }) : nativeImage.createFromPath(join(__dirname, '../../build/icon.png'));
  return icon;
}

export function showWindow(window: BrowserWindow) {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

export interface BackgroundOptions {
  context: AppContext;
  /** Work the main process runs on its own. */
  isRecording: () => boolean;
}

export function setupBackground({ context, isRecording }: BackgroundOptions) {
  const busy = () => uiBusy || isRecording();

  function confirmQuit(): boolean {
    if (!busy()) return true;
    const response = dialog.showMessageBoxSync({
      type: 'warning',
      title: t.background.quitDialog.title,
      message: t.background.quitDialog.title,
      detail: t.background.quitDialog.detail,
      buttons: [t.background.quitDialog.keep, t.background.quitDialog.quit],
      defaultId: 0,
      cancelId: 0,
    });
    return response !== 0;
  }

  async function showTray() {
    if (tray) return;
    tray = new Tray(await appIcon());
    tray.setToolTip(busy() ? t.background.busyTooltip : t.app.name);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: t.background.open, click: () => showWindow(context.window()) },
        { type: 'separator' },
        {
          label: t.background.quit,
          click: () => {
            if (!confirmQuit()) return;
            quitting = true;
            app.quit();
          },
        },
      ]),
    );
    tray.on('click', () => showWindow(context.window()));
  }

  app.on('before-quit', () => {
    // Updating, or quitting from the notification area: nothing is held back from here on.
    quitting = true;
  });

  context.window().on('close', (event) => {
    if (quitting || (!busy() && !readSettings().keepInBackground)) return;
    event.preventDefault();
    context.window().hide();
    showTray();
    if (!toldAboutBackground) {
      toldAboutBackground = true;
      notify(busy() ? t.background.stillWorking : t.background.stillOpen);
    }
  });

  listen('app:busy', (value) => {
    uiBusy = value;
    tray?.setToolTip(busy() ? t.background.busyTooltip : t.app.name);
  });

  function notify(body: string, route?: AppRoute | null) {
    if (!Notification.isSupported()) return;
    appIcon().then((image) => {
      const notification = new Notification({ title: t.app.name, body, icon: image });
      notification.on('click', () => {
        showWindow(context.window());
        if (route) context.emit('app:navigate', route);
      });
      notification.show();
    });
  }

  handle('app:systemNotification', (body, route) => {
    const window = context.window();
    if (!window.isVisible() || window.isMinimized()) notify(body, route);
  });
}
