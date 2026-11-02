// FFmpeg as a service: tracked runs with progress and cancellation, and one-shot captures.
import { spawn, type ChildProcess } from 'node:child_process';
import ffmpegStaticPath from 'ffmpeg-static';
import { AppError, type AppErrorCode } from '../../shared/errors.ts';

// A packaged app cannot execute anything from inside the .asar.
const FFMPEG_PATH = (ffmpegStaticPath as unknown as string).replace('app.asar', 'app.asar.unpacked');
const BASE_ARGS = ['-hide_banner', '-nostdin'];
const STDERR_TAIL_CHARACTERS = 20000;

const running = new Map<string, ChildProcess>();

function clockToSeconds(clock: string): number {
  const [hours, minutes, seconds] = clock.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

export interface FfmpegRun {
  jobId: string;
  args: string[];
  failureCode: AppErrorCode;
  onProgress?: (fraction: number) => void;
  /** Needed when the output is shorter than the input, as in a trim. */
  knownDuration?: number;
  /** Where relative paths in the arguments start from. */
  workingFolder?: string;
}

export function runFfmpeg({ jobId, args, failureCode, onProgress, knownDuration = 0, workingFolder }: FfmpegRun): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(FFMPEG_PATH, [...BASE_ARGS, '-y', ...args], { windowsHide: true, cwd: workingFolder });
    running.set(jobId, process);
    let duration = knownDuration;
    let tail = '';
    process.stderr.setEncoding('utf8');
    process.stderr.on('data', (text: string) => {
      tail = (tail + text).slice(-STDERR_TAIL_CHARACTERS);
      if (!duration) {
        const match = text.match(/Duration: (\d+:\d+:\d+\.\d+)/);
        if (match) duration = clockToSeconds(match[1]);
      }
      const time = text.match(/time=(\d+:\d+:\d+\.\d+)/);
      if (time && duration) onProgress?.(Math.min(1, clockToSeconds(time[1]) / duration));
    });
    process.on('error', reject);
    process.on('close', (code, signal) => {
      running.delete(jobId);
      if (code === 0) return resolve();
      if (signal) return reject(new AppError('cancelled'));
      console.error('FFmpeg failed:', tail.slice(-600));
      reject(new AppError(failureCode));
    });
  });
}

export function cancelFfmpeg(jobId: string) {
  running.get(jobId)?.kill();
}

export interface FfmpegCapture {
  exitCode: number | null;
  stderr: string;
  stdout: Buffer;
}

/** Short untracked run that collects the output: probes, thumbnails, encoder tests. */
export function captureFfmpeg(args: string[], collectStdout = false): Promise<FfmpegCapture> {
  return new Promise((resolve, reject) => {
    const process = spawn(FFMPEG_PATH, [...BASE_ARGS, ...args], { windowsHide: true });
    const chunks: Buffer[] = [];
    let stderr = '';
    if (collectStdout) process.stdout.on('data', (chunk) => chunks.push(chunk));
    process.stderr.setEncoding('utf8');
    process.stderr.on('data', (text: string) => (stderr = (stderr + text).slice(-STDERR_TAIL_CHARACTERS)));
    process.on('error', reject);
    process.on('close', (exitCode) => resolve({ exitCode, stderr, stdout: Buffer.concat(chunks) }));
  });
}
