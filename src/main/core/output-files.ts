// Where results are saved. A file is never overwritten: neither the original nor an existing one.
import { existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

// Parallel jobs can ask for the same name before it exists on disk.
const reserved = new Set<string>();

export interface OutputRequest {
  source: string;
  suffix: string;
  extension: string;
  folder: string | null;
}

function reserveOutputPath({ source, suffix, extension, folder }: OutputRequest): string {
  const name = basename(source, extname(source));
  const directory = folder || dirname(source);
  for (let attempt = 1; ; attempt++) {
    const path = join(directory, `${name}${suffix}${attempt > 1 ? ` (${attempt})` : ''}.${extension}`);
    const key = path.toLowerCase();
    if (key === source.toLowerCase() || existsSync(path) || reserved.has(key)) continue;
    reserved.add(key);
    return path;
  }
}

/**
 * A result being written. FFmpeg and sharp write to a hidden partial file that only takes its final
 * name when complete, so a failed or cancelled job never leaves a broken file behind.
 */
export class PendingOutput {
  readonly path: string;
  /** Keeps the extension, which FFmpeg uses to pick the format. */
  readonly partialPath: string;

  constructor(request: OutputRequest) {
    this.path = reserveOutputPath(request);
    this.partialPath = join(dirname(this.path), `.partial-${basename(this.path)}`);
  }

  partialBytes(): number {
    return statSync(this.partialPath).size;
  }

  commit(): string {
    renameSync(this.partialPath, this.path);
    reserved.delete(this.path.toLowerCase());
    return this.path;
  }

  discard() {
    rmSync(this.partialPath, { force: true });
    reserved.delete(this.path.toLowerCase());
  }
}

/** Runs the writer and commits, or discards the partial file if anything goes wrong. */
export async function withPendingOutput<T>(output: PendingOutput, write: (output: PendingOutput) => Promise<T>): Promise<T> {
  try {
    return await write(output);
  } catch (error) {
    output.discard();
    throw error;
  }
}
