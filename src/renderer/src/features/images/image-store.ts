import type { ImageOptions } from '../../../../shared/jobs.ts';
import { createStore } from '../../lib/create-store.ts';
import { createBatch } from '../file-batch/batch-store.ts';

// Image encoding is multi-threaded, so a few files at a time is the sweet spot.
const IMAGE_CONCURRENCY = 3;

export const imageBatch = createBatch(['image'], IMAGE_CONCURRENCY);

export const imageOptions = createStore<ImageOptions>({
  format: 'same',
  quality: 80,
  lossless: false,
  maxSide: null,
  stripMetadata: true,
});
