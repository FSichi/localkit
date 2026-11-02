// Subtitles need a transcript: one already in the library is reused, otherwise the video gets transcribed.
import { t } from '../../../../shared/i18n/index.ts';
import type { JobRequest } from '../../../../shared/jobs.ts';
import type { LibraryItem } from '../../../../shared/transcription.ts';
import { findModel } from '../../../../shared/whisper-models.ts';
import { appStore, currentModelId } from '../../app/app-store.ts';
import { invoke } from '../../lib/bridge.ts';
import type { BatchFile, BatchTask } from '../file-batch/batch-store.ts';
import { transcribeFile } from '../transcription/transcription-queue.ts';
import { mediaOptions } from './media-store.ts';

/** A transcript only counts if it was made with what is selected now, or changing them would do nothing. */
async function findTranscript(path: string): Promise<LibraryItem | null> {
  const { language } = appStore.get().settings;
  const quality = t.models[findModel(currentModelId()).tier].name;
  const items = await invoke('library:list', '');
  const match = items.find((item) => (item.videoPath ?? item.audioPath) === path && item.status === 'transcribed' && item.language === language && item.quality === quality);
  return match ? invoke('library:get', match.id) : null;
}

export async function buildSubtitlesRequest({ path }: BatchFile, { signal, update }: BatchTask): Promise<JobRequest> {
  const transcript = (await findTranscript(path)) ?? (await transcribeFile(path, ({ fraction, detail }) => update({ fraction: fraction ?? 0, detail }), signal));
  update({ fraction: 0, detail: t.media.subtitles.adding });
  return { type: 'video.subtitles', path, segments: transcript.segments, options: mediaOptions.get().subtitles };
}
