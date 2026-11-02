// Job runner: each job type has a processor. Features contribute theirs at startup.
import type { JobRequest, JobResult, JobType } from '../../shared/jobs.ts';
import { handle, type AppContext } from '../app/ipc.ts';
import { cancelFfmpeg } from './ffmpeg.ts';

export interface JobContext {
  id: string;
  /** Where to save; null means next to the original. */
  outputFolder: string | null;
  reportProgress(fraction: number): void;
}

export type JobProcessor<T extends JobType> = (request: Extract<JobRequest, { type: T }>, context: JobContext) => Promise<JobResult>;

/** Requires a processor for every job type, so a new job cannot be forgotten. */
export type JobProcessors = { [T in JobType]: JobProcessor<T> };

export function registerJobsIpc(context: AppContext, processors: JobProcessors) {
  handle('jobs:run', (id, request, outputFolder) => {
    const processor = processors[request.type] as JobProcessor<typeof request.type>;
    return processor(request, {
      id,
      outputFolder,
      reportProgress: (fraction) => context.emit('jobs:progress', { id, fraction }),
    });
  });
  handle('jobs:cancel', (id) => cancelFfmpeg(id));
}
