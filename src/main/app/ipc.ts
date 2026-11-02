// Typed wrappers over Electron's IPC, plus the context every feature receives at registration.
import { ipcMain, type BrowserWindow } from 'electron';
import { encodeErrorForIpc } from '../../shared/errors.ts';
import type { EventContract, InvokeArgs, InvokeChannel, InvokeResult, SendContract } from '../../shared/ipc.ts';

export interface AppContext {
  /** The main window. Only valid once created, which is always the case when a handler runs. */
  window(): BrowserWindow;
  emit<C extends keyof EventContract>(channel: C, payload: EventContract[C]): void;
}

export function handle<C extends InvokeChannel>(
  channel: C,
  handler: (...args: InvokeArgs<C>) => InvokeResult<C> | Promise<InvokeResult<C>>,
) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await handler(...(args as InvokeArgs<C>));
    } catch (error) {
      throw new Error(encodeErrorForIpc(error));
    }
  });
}

export function listen<C extends keyof SendContract>(channel: C, handler: (...args: SendContract[C]) => void) {
  ipcMain.on(channel, (_event, ...args) => handler(...(args as SendContract[C])));
}
