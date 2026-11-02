// What every downloadable AI model declares, so the store handles them all the same way.
import type { ComputeProfile } from './transcription.ts';

export interface DownloadableModel {
  id: string;
  /** Approximate download size per profile. */
  bytes: Record<ComputeProfile, number>;
  files: Record<ComputeProfile, string[]>;
  /** Where a file comes from, for models spread over several repositories. */
  sourceUrl?: (file: string) => string;
}
