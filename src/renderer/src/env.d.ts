/// <reference types="@webgpu/types" />
/// <reference types="vite/client" />
import type { Bridge } from '../../shared/ipc.ts';

declare global {
  interface Window {
    bridge: Bridge;
  }
}
