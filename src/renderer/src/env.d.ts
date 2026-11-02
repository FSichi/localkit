/// <reference types="@webgpu/types" />
import type { Bridge } from '../../shared/ipc.ts';

declare global {
  interface Window {
    bridge: Bridge;
  }
}
