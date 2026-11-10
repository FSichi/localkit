// Removes parts of an audio file, draws its waveform and turns an edited recording into a new one.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { removalFilter, editedDuration, type TimeRange } from '../../../shared/audio-edit.ts';
import { AppError } from '../../../shared/errors.ts';
import { extensionOf } from '../../../shared/files.ts';
import { t } from '../../../shared/i18n/index.ts';
import type { EditedAudioFormat } from '../../../shared/jobs.ts';
import type { LibraryItem } from '../../../shared/transcription.ts';
import { handle } from '../../app/ipc.ts';
import { captureFfmpeg, runFfmpeg } from '../../core/ffmpeg.ts';
import type { JobProcessor } from '../../core/jobs.ts';
import { PendingOutput, withPendingOutput } from '../../core/output-files.ts';
import { createItem, getItem } from '../library/library-store.ts';
import { probeMedia } from '../media/media-probe.ts';

/** Plenty to draw the shape of the sound, and cheap to read even for an hour. */
const WAVEFORM_SAMPLE_RATE = 2000;
const BYTES_PER_SAMPLE = 2;

/** Each format with how to write it. "same" keeps the original's when FFmpeg can write it. */
const ENCODERS: Record<string, { extension: string; args: string[] }> = {
  mp3: { extension: 'mp3', args: ['-c:a', 'libmp3lame', '-q:a', '2'] },
  m4a: { extension: 'm4a', args: ['-c:a', 'aac', '-b:a', '192k'] },
  wav: { extension: 'wav', args: ['-c:a', 'pcm_s16le'] },
  flac: { extension: 'flac', args: ['-c:a', 'flac'] },
  ogg: { extension: 'ogg', args: ['-c:a', 'libopus', '-b:a', '160k'] },
  webm: { extension: 'webm', args: ['-c:a', 'libopus', '-b:a', '192k'] },
};
const SOURCE_ENCODERS: Record<string, string> = { mp3: 'mp3', m4a: 'm4a', aac: 'm4a', wav: 'wav', flac: 'flac', ogg: 'ogg', opus: 'ogg', webm: 'webm' };

const encoderFor = (format: EditedAudioFormat, source: string) => ENCODERS[format === 'same' ? (SOURCE_ENCODERS[extensionOf(source)] ?? 'mp3') : format];

/** The loudest point of each slice of the audio, from 0 to 1. */
async function readWaveform(path: string, points: number): Promise<number[]> {
  const { stdout } = await captureFfmpeg(['-i', path, '-vn', '-ac', '1', '-ar', String(WAVEFORM_SAMPLE_RATE), '-f', 's16le', 'pipe:1'], true);
  const samples = Math.floor(stdout.length / BYTES_PER_SAMPLE);
  if (!samples) throw new AppError('noAudioStream');
  const peaks = new Array<number>(points).fill(0);
  for (let index = 0; index < samples; index++) {
    const point = Math.floor((index * points) / samples);
    const level = Math.abs(stdout.readInt16LE(index * BYTES_PER_SAMPLE)) / 32768;
    if (level > peaks[point]) peaks[point] = level;
  }
  return peaks;
}

function removeParts(jobId: string, input: string, output: string, cuts: TimeRange[], duration: number, encoderArgs: string[], onProgress?: (fraction: number) => void) {
  return runFfmpeg({
    jobId,
    args: ['-i', input, '-vn', '-af', removalFilter(cuts, duration), ...encoderArgs, output],
    failureCode: 'audioEditFailed',
    onProgress,
    knownDuration: editedDuration(cuts, duration),
  });
}

export const editAudio: JobProcessor<'audio.edit'> = async ({ path, cuts, format }, { id, outputFolder, reportProgress }) => {
  const bytesBefore = statSync(path).size;
  const { duration, audioCodec } = await probeMedia(path);
  if (!audioCodec) throw new AppError('noAudioStream');
  const encoder = encoderFor(format, path);
  const output = new PendingOutput({ source: path, suffix: t.fileSuffixes.edited, extension: encoder.extension, folder: outputFolder });
  return withPendingOutput(output, async () => {
    await removeParts(id, path, output.partialPath, cuts, duration, encoder.args, reportProgress);
    const bytesAfter = output.partialBytes();
    return { output: output.commit(), bytesBefore, bytesAfter };
  });
};

function uniqueFolder(folder: string): string {
  const base = `${folder} ${t.audioEditor.editedFolder}`;
  let candidate = base;
  for (let attempt = 2; existsSync(candidate); attempt++) candidate = `${base} (${attempt})`;
  return candidate;
}

/**
 * A library item with the parts removed, ready to transcribe. A recording keeps its separate tracks,
 * so the app still tells who said what. The original is never touched.
 */
async function createEditedItem(id: string, cuts: TimeRange[]): Promise<LibraryItem> {
  const item = getItem(id);
  if (!item.audioPath) throw new AppError('fileUnreadable');
  const { duration } = await probeMedia(item.audioPath);
  const jobId = `edit-${randomUUID()}`;
  const common = {
    title: `${item.title} ${t.audioEditor.editedTitle}`,
    kind: item.kind,
    createdAt: new Date().toISOString(),
    duration: editedDuration(cuts, duration),
    source: item.source,
    status: 'pending' as const,
    segments: [],
  };

  if (item.tracksPath && item.folder) {
    const folder = uniqueFolder(item.folder);
    mkdirSync(folder, { recursive: true });
    const tracksPath = join(folder, basename(item.tracksPath));
    const audioPath = join(folder, basename(item.audioPath));
    await removeParts(jobId, item.tracksPath, tracksPath, cuts, duration, ENCODERS.webm.args);
    await removeParts(jobId, item.audioPath, audioPath, cuts, duration, encoderFor('same', item.audioPath).args);
    return createItem({ ...common, folder, audioPath, tracksPath });
  }

  const encoder = encoderFor('same', item.audioPath);
  const output = new PendingOutput({ source: item.audioPath, suffix: t.fileSuffixes.edited, extension: encoder.extension, folder: dirname(item.audioPath) });
  const audioPath = await withPendingOutput(output, async () => {
    await removeParts(jobId, item.audioPath!, output.partialPath, cuts, duration, encoder.args);
    return output.commit();
  });
  return createItem({ ...common, title: basename(audioPath, extname(audioPath)), audioPath });
}

export function registerAudioEditingIpc() {
  handle('audio:waveform', readWaveform);
  handle('library:createEdited', createEditedItem);
}
