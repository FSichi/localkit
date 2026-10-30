/// <reference types="@webgpu/types" />
import type { Api } from '../../preload/index.ts';

declare global {
  interface Window {
    api: Api;
  }
}
