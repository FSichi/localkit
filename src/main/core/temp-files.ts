// Temporary working space. Decoded audio can weigh hundreds of MB, so it is wiped on exit.
import { app } from 'electron';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export function tempRoot(): string {
  const path = join(app.getPath('temp'), 'localkit');
  mkdirSync(path, { recursive: true });
  return path;
}

export const jobTempFolder = (jobId: string) => join(tempRoot(), jobId.replace(/[^\w-]/g, ''));

export function removeJobTempFolder(jobId: string) {
  try {
    rmSync(jobTempFolder(jobId), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    // After a cancellation Windows can hold on to the files for a while. They go away on exit.
    console.warn('Could not remove the temporary folder yet', error);
  }
}

export function removeTempRoot() {
  rmSync(tempRoot(), { recursive: true, force: true });
}
