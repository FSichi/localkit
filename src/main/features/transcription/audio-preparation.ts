// Decodes any audio or video to 16 kHz PCM, one track per person that has to be told apart.
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AudioSource, PreparedTrack, Speaker } from '../../../shared/transcription.ts';
import { handle, type AppContext } from '../../app/ipc.ts';
import { APP_SCHEME, serveFolder } from '../../app/protocol.ts';
import { cancelFfmpeg, runFfmpeg } from '../../core/ffmpeg.ts';
import { jobTempFolder, removeJobTempFolder, tempRoot } from '../../core/temp-files.ts';

const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 4;

type Channel = 'mix' | 'left' | 'right';

const CHANNEL_FILTERS: Record<Channel, string[]> = {
  mix: [],
  left: ['-af', 'pan=mono|c0=c0'],
  right: ['-af', 'pan=mono|c0=c1'],
};

/** Recordings keep the microphone on the left and the system sound on the right. */
const TRACK_LAYOUTS: Record<AudioSource | 'file', { channel: Channel; speaker?: Speaker }[]> = {
  both: [{ channel: 'right', speaker: 'others' }, { channel: 'left', speaker: 'me' }],
  system: [{ channel: 'right' }],
  microphone: [{ channel: 'left' }],
  file: [{ channel: 'mix' }],
};

export async function prepareTracks(
  jobId: string,
  path: string,
  source: AudioSource | undefined,
  report: (fraction: number) => void,
): Promise<PreparedTrack[]> {
  const folder = jobTempFolder(jobId);
  mkdirSync(folder, { recursive: true });
  const layout = TRACK_LAYOUTS[source ?? 'file'];

  const tracks: PreparedTrack[] = [];
  for (const [index, { channel, speaker }] of layout.entries()) {
    const fileName = `track-${index}.pcm`;
    const target = join(folder, fileName);
    await runFfmpeg({
      jobId,
      args: ['-i', path, '-vn', ...CHANNEL_FILTERS[channel], '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', target],
      failureCode: 'fileUnreadable',
      onProgress: (fraction) => report((index + fraction) / layout.length),
    });
    tracks.push({
      url: `${APP_SCHEME}://temp/${encodeURIComponent(jobId)}/${fileName}`,
      speaker,
      duration: statSync(target).size / BYTES_PER_SAMPLE / SAMPLE_RATE,
    });
  }
  return tracks;
}

export function registerPreparationIpc(context: AppContext) {
  serveFolder('temp', (relativePath) => ({ root: tempRoot(), path: relativePath }));
  handle('transcription:prepare', (jobId, path, source) =>
    prepareTracks(jobId, path, source, (fraction) => context.emit('transcription:preparationProgress', { jobId, fraction })),
  );
  handle('transcription:cancelPreparation', (jobId) => cancelFfmpeg(jobId));
  handle('transcription:cleanup', (jobId) => removeJobTempFolder(jobId));
}
