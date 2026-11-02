import type { AudioFormat, MediaFormat, VideoCompressionOptions } from '../../../../shared/jobs.ts';
import { createStore } from '../../lib/create-store.ts';
import { createBatch } from '../file-batch/batch-store.ts';

export type MediaMode = 'compress' | 'convert' | 'extractAudio' | 'trim';

// Video encoding already uses the whole GPU or CPU: running two at once only slows both down.
const MEDIA_CONCURRENCY = 1;

export const mediaBatch = createBatch(['video', 'audio'], MEDIA_CONCURRENCY);

export const mediaOptions = createStore<{
  mode: MediaMode;
  compression: VideoCompressionOptions;
  convertFormat: MediaFormat;
  audioFormat: AudioFormat;
}>({
  mode: 'compress',
  compression: { mode: 'quality', level: 'medium', targetMegabytes: 25, resolution: 0, codec: 'h264' },
  convertFormat: 'mp4',
  audioFormat: 'mp3',
});

export function setMediaMode(mode: MediaMode) {
  mediaOptions.set({ mode });
  mediaBatch.resetResults();
}

export function openMedia(paths: string[], mode: MediaMode) {
  setMediaMode(mode);
  mediaBatch.add(paths);
}
