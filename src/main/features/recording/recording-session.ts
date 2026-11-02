// Writes to disk as audio arrives: if the app or the PC go down, what was recorded is not lost.
import { randomUUID } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';
import { AppError } from '../../../shared/errors.ts';
import { formatDayMonth, formatTime } from '../../../shared/format.ts';
import { t } from '../../../shared/i18n/index.ts';
import type { AudioSource, LibraryItem, RecordingStarted } from '../../../shared/transcription.ts';
import { handle, listen } from '../../app/ipc.ts';
import { readRecordingMarker } from '../../app/legacy-schema.ts';
import { readSettings } from '../../app/settings-store.ts';
import { runFfmpeg } from '../../core/ffmpeg.ts';
import { removeJobTempFolder } from '../../core/temp-files.ts';
import { createItem, listItems } from '../library/library-store.ts';
import { prepareTracks } from '../transcription/audio-preparation.ts';

// User-visible names, kept stable so older recordings stay valid.
const RECORDINGS_FOLDER = 'Grabaciones';
const TRACKS_FILE = 'pistas.webm';
const AUDIO_FILE = 'grabacion.mp3';
const MARKER_FILE = 'en-curso.json';

/** MP3 to listen to: an even mix, centered in stereo. */
const MP3_MIX: Record<AudioSource, string> = {
  both: 'pan=stereo|c0=0.6*c0+0.6*c1|c1=0.6*c0+0.6*c1',
  system: 'pan=stereo|c0=c1|c1=c1',
  microphone: 'pan=stereo|c0=c0|c1=c0',
};

interface ActiveRecording {
  id: string;
  folder: string;
  source: AudioSource;
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

function startRecording(source: AudioSource): RecordingStarted {
  if (active) throw new AppError('recordingAlreadyActive');
  const startedAt = new Date();
  const folder = join(recordingsRoot(), uniqueFolderName(startedAt));
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, MARKER_FILE), JSON.stringify({ source, startedAt: startedAt.toISOString() }));
  active = { id: randomUUID(), folder, source, startedAt, output: createWriteStream(join(folder, TRACKS_FILE)) };
  return { id: active.id, folder };
}

const closeOutput = (recording: ActiveRecording) => new Promise<void>((resolve) => recording.output.end(resolve));

async function finishFolder(folder: string, source: AudioSource, startedAt: Date, duration: number): Promise<LibraryItem> {
  const tracksPath = join(folder, TRACKS_FILE);
  const audioPath = join(folder, AUDIO_FILE);
  await runFfmpeg({
    jobId: `mp3-${randomUUID()}`,
    args: ['-i', tracksPath, '-af', MP3_MIX[source], '-c:a', 'libmp3lame', '-q:a', '3', audioPath],
    failureCode: 'fileUnreadable',
  });
  const item = createItem({
    title: t.record.defaultTitle(formatDayMonth(startedAt), formatTime(startedAt)),
    kind: 'recording',
    createdAt: startedAt.toISOString(),
    duration,
    audioPath,
    tracksPath,
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
  return finishFolder(recording.folder, recording.source, recording.startedAt, duration);
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
    const tracksPath = join(folder, TRACKS_FILE);
    if (!existsSync(tracksPath) || statSync(tracksPath).size === 0) continue;
    try {
      const { source, startedAt } = readRecordingMarker(JSON.parse(readFileSync(join(folder, MARKER_FILE), 'utf8')));
      const jobId = `recovery-${randomUUID()}`;
      const [track] = await prepareTracks(jobId, tracksPath, undefined, () => {});
      removeJobTempFolder(jobId);
      await finishFolder(folder, source, new Date(startedAt), track.duration);
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
