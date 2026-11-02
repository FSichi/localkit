// Secure bridge between the UI and the main process. Generic on purpose: channels live in shared/ipc.ts.
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { Bridge } from '../shared/ipc.ts';

const bridge: Bridge = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  on: (channel, listener) => {
    const handler = (_event: unknown, payload: unknown) => listener(payload as never);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  },
  pathForFile: (file) => webUtils.getPathForFile(file),
};

contextBridge.exposeInMainWorld('bridge', bridge);
