import { t } from '../../../shared/i18n/index.ts';
import type { AppRoute } from '../../../shared/ipc.ts';
import { invoke } from '../lib/bridge.ts';
import { createStore } from '../lib/create-store.ts';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
  action?: { label: string; run: () => void };
}

const DURATION_MS = 3200;
const DURATION_WITH_ACTION_MS = 7000;

export const toasts = createStore<{ items: Toast[] }>({ items: [] });

let nextId = 1;

interface NotifyOptions extends Partial<Pick<Toast, 'kind' | 'action'>> {
  /** Where a click on the Windows notification leads, when the window is not on screen. */
  route?: AppRoute;
}

export function notify(text: string, { route, ...options }: NotifyOptions = {}) {
  // If the window is hidden or minimized, the main process passes it on to Windows.
  invoke('app:systemNotification', text, route ?? null);
  const id = nextId++;
  toasts.set({ items: [...toasts.get().items, { id, text, kind: 'info', ...options }] });
  setTimeout(() => toasts.set({ items: toasts.get().items.filter((toast) => toast.id !== id) }), options.action ? DURATION_WITH_ACTION_MS : DURATION_MS);
}

export const notifyError = (text: string) => notify(text, { kind: 'error' });

export function notifySaved(text: string, path: string) {
  notify(text, { action: { label: t.common.show, run: () => invoke('shell:showItem', path) } });
}
