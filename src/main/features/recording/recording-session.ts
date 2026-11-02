// Writes to disk as audio arrives: if the app or the PC go down, what was recorded is not lost.
import { randomUUID } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';
import { AppError } from '../../../shared/errors.ts';
import { formatDayMonth, formatTime } from '../../../shared/format.ts';
import { t } from '../../../shared/i18n/index.ts';
import type { AudioSource, LibraryItem, RecordingCapture, RecordingStarted } from '../../../shared/transcription.ts';
import { handle, listen } from '../../app/ipc.ts';
import { readRecordingMarker } from '../../app/legacy-schema.ts';
import { readSettings } from '../../app/settings-store.ts';
import { runFfmpeg } from '../../core/ffmpeg.ts';
import { removeJobTempFolder } from '../../core/temp-files.ts';
import { createItem, listItems } from '../library/library-store.ts';
import { probeMedia } from '../media/media-probe.ts';
import { detectVideoEncoder, softwareEncoder, withEncoderFallback, type VideoEncoder } from '../media/video-encoders.ts';
import { prepareTracks } from '../transcription/audio-preparation.ts';

// User-visible names, kept stable so older recordings stay valid.
const RECORDINGS_FOLDER = 'Grabaciones';
const TRACKS_FILE = 'pistas.webm';
const AUDIO_FILE = 'grabacion.mp3';
const MARKER_FILE = 'en-curso.json';
const SCREEN_CAPTURE_FILE = 'pantalla.webm';
const VIDEO_FILE = 'pantalla.mp4';

/** Written to while recording: if it survives, the screen recording was never finished. */
const FILE_BEING_RECORDED: Record<RecordingCapture, string> = { audio: TRACKS_FILE, screen: SCREEN_CAPTURE_FILE };

/** For listening: an even mix, centered in stereo. */
const LISTENING_MIX: Record<AudioSource, string> = {
  both: 'pan=stereo|c0=0.6*c0+0.6*c1|c1=0.6*c0+0.6*c1',
  system: 'pan=stereo|c0=c1|c1=c1',
  microphone: 'pan=stereo|c0=c0|c1=c0',
};

interface ActiveRecording {
  id: string;
  folder: string;
  source: AudioSource;
  capture: RecordingCapture;
  startedAt: Date;
  output: WriteStream;
}

let active: ActiveRecording | null = null;

export const isRecording = () => active !== null;

const recordingsRoot = () => join(readSettings().recordingsFolder, RECORDINGS_FOLDER);

function uniqueFolderName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}.${pad(date.getMinutes())}`;
  let name = base;
  for (let attempt = 2; existsSync(join(recordingsRoot(), name)); attempt++) name = `${base} (${attempt})`;
  return name;
}

function startRecording(source: AudioSource, capture: RecordingCapture): RecordingStarted {
  if (active) throw new AppError('recordingAlreadyActive');
  const startedAt = new Date();
  const folder = join(recordingsRoot(), uniqueFolderName(startedAt));
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, MARKER_FILE), JSON.stringify({ source, capture, startedAt: startedAt.toISOString() }));
  active = { id: randomUUID(), folder, source, capture, startedAt, output: createWriteStream(join(folder, FILE_BEING_RECORDED[capture])) };
  return { id: active.id, folder };
}

const closeOutput = (recording: ActiveRecording) => new Promise<void>((resolve) => recording.output.end(resolve));

/**
 * Turns the capture into a video anyone can play, with the audio mixed for listening, and keeps the
 * separate tracks for transcribing. The capture goes last, so a failure can be retried.
 */
async function splitScreenCapture(folder: string, source: AudioSource): Promise<string> {
  const capturePath = join(folder, SCREEN_CAPTURE_FILE);
  const videoPath = join(folder, VIDEO_FILE);
  if (!existsSync(capturePath)) return videoPath;

  const canCopyVideo = (await probeMedia(capturePath)).videoCodec === 'h264';
  const videoArgs = (encoder: VideoEncoder) =>
    canCopyVideo ? ['-c:v', 'copy'] : ['-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', ...encoder.qualityArgs('h264', 'high'), '-pix_fmt', 'yuv420p'];
  await withEncoderFallback(canCopyVideo ? softwareEncoder : await detectVideoEncoder(), (encoder) =>
    runFfmpeg({
      jobId: `screen-${randomUUID()}`,
      args: ['-i', capturePath, ...videoArgs(encoder), '-af', LISTENING_MIX[source], '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', videoPath],
      failureCode: 'screenRecordingFailed',
    }),
  );
  await runFfmpeg({
    jobId: `tracks-${randomUUID()}`,
    args: ['-i', capturePath, '-map', '0:a', '-c:a', 'copy', join(folder, TRACKS_FILE)],
    failureCode: 'screenRecordingFailed',
  });
  rmSync(capturePath, { force: true });
  return videoPath;
}

async function finishFolder(folder: string, source: AudioSource, capture: RecordingCapture, startedAt: Date, duration: number): Promise<LibraryItem> {
  const videoPath = capture === 'screen' ? await splitScreenCapture(folder, source) : undefined;
  const tracksPath = join(folder, TRACKS_FILE);
  const audioPath = join(folder, AUDIO_FILE);
  await runFfmpeg({
    jobId: `mp3-${randomUUID()}`,
    args: ['-i', tracksPath, '-af', LISTENING_MIX[source], '-c:a', 'libmp3lame', '-q:a', '3', audioPath],
    failureCode: 'fileUnreadable',
  });
  const item = createItem({
    title: t.record.defaultTitle(formatDayMonth(startedAt), formatTime(startedAt)),
    kind: 'recording',
    createdAt: startedAt.toISOString(),
    duration,
    audioPath,
    tracksPath,
    videoPath,
    folder,
    source,
    status: 'pending',
    segments: [],
  });
  rmSync(join(folder, MARKER_FILE), { force: true });
  return item;
}

function takeActive(id: string): ActiveRecording {
  if (active?.id !== id) throw new AppError('recordingNotActive');
  const recording = active;
  active = null;
  return recording;
}

async function stopRecording(id: string, duration: number): Promise<LibraryItem> {
  const recording = takeActive(id);
  await closeOutput(recording);
  return finishFolder(recording.folder, recording.source, recording.capture, recording.startedAt, duration);
}

async function discardRecording(id: string) {
  const recording = takeActive(id);
  await closeOutput(recording);
  rmSync(recording.folder, { recursive: true, force: true });
}

/** Recordings left open (the app closed, the power went out) are rescued on startup. */
async function recoverRecordings(): Promise<number> {
  if (active || !existsSync(recordingsRoot())) return 0;
  const known = new Set(listItems().map((item) => item.folder));
  let recovered = 0;
  for (const entry of readdirSync(recordingsRoot(), { withFileTypes: true })) {
    const folder = join(recordingsRoot(), entry.name);
    if (!entry.isDirectory() || known.has(folder) || !existsSync(join(folder, MARKER_FILE))) continue;
    try {
      const { source, capture, startedAt } = readRecordingMarker(JSON.parse(readFileSync(join(folder, MARKER_FILE), 'utf8')));
      const recorded = [join(folder, FILE_BEING_RECORDED[capture]), join(folder, TRACKS_FILE)].find((path) => existsSync(path) && statSync(path).size > 0);
      if (!recorded) continue;
      const jobId = `recovery-${randomUUID()}`;
      const [track] = await prepareTracks(jobId, recorded, undefined, () => {});
      removeJobTempFolder(jobId);
      await finishFolder(folder, source, capture, new Date(startedAt), track.duration);
      recovered++;
    } catch (error) {
      console.error('Could not recover recording', folder, error);
    }
  }
  return recovered;
}

export function registerRecordingIpc() {
  handle('recording:start', startRecording);
  handle('recording:stop', stopRecording);
  handle('recording:discard', discardRecording);
  handle('recording:recover', recoverRecordings);
  listen('recording:chunk', (id, data) => {
    if (active?.id === id) active.output.write(Buffer.from(data));
  });
}
