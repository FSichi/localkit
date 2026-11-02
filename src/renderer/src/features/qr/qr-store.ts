import { createStore } from '../../lib/create-store.ts';
import type { QrStyle } from './qr-rendering.ts';

export const qrStore = createStore<{ style: QrStyle }>({
  style: { size: 1024, margin: 2, foreground: '#000000', background: '#ffffff', correction: 'M' },
});
