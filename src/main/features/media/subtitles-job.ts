// Adds subtitles to a video: burned into the picture, as a track players can turn off, or as a file.
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppError } from '../../../shared/errors.ts';
import { extensionOf } from '../../../shared/files.ts';
import { t } from '../../../shared/i18n/index.ts';
import type { JobRequest, JobResult, SubtitleSize } from '../../../shared/jobs.ts';
import { toSrt } from '../../../shared/transcript-format.ts';
import { runFfmpeg } from '../../core/ffmpeg.ts';
import type { JobContext, JobProcessor } from '../../core/jobs.ts';
import { PendingOutput, withPendingOutput } from '../../core/output-files.ts';
import { jobTempFolder, removeJobTempFolder } from '../../core/temp-files.ts';
import { probeMedia, type MediaProbe } from './media-probe.ts';
import { detectVideoEncoder, withEncoderFallback, type VideoEncoder } from './video-encoders.ts';

/** Relative to the job's folder: Windows paths would need escaping inside a filter. */
const SUBTITLES_FILE = 'subtitles.srt';

/** In libass units, where the frame is 288 tall, so they scale with the video. */
const FONT_SIZES: Record<SubtitleSize, number> = { small: 14, medium: 18, large: 24 };

const MP4_EXTENSIONS = ['mp4', 'm4v', 'mov'];

const burnFilter = (size: SubtitleSize) => `subtitles=${SUBTITLES_FILE}:force_style='FontName=Segoe UI,FontSize=${FONT_SIZES[size]},Outline=1.5,Shadow=0.5,MarginV=18'`;

type VideoRequest = Extract<JobRequest, { type: 'video.subtitles' }>;

interface SubtitleWork {
  request: VideoRequest;
  context: JobContext;
  media: MediaProbe;
  /** The job's folder, which holds the subtitles file. */
  folder: string;
  bytesBefore: number;
}

function burn({ request, context, media, folder, bytesBefore }: SubtitleWork): Promise<JobResult> {
  const { path, options } = request;
  const { id, outputFolder, reportProgress } = context;
  const output = new PendingOutput({ source: path, suffix: t.fileSuffixes.subtitled, extension: 'mp4', folder: outputFolder });
  const audio = /^(aac|mp3)$/.test(media.audioCodec ?? 'aac') ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '160k'];
  const buildArgs = (encoder: VideoEncoder) => [
    '-i', path,
    '-map', '0:v:0', '-map', '0:a?',
    '-vf', burnFilter(options.size),
    ...encoder.qualityArgs('h264', 'high'),
    '-pix_fmt', 'yuv420p',
    ...audio,
    '-movflags', '+faststart',
    output.partialPath,
  ];
  return withPendingOutput(output, async () => {
    await withEncoderFallback(await detectVideoEncoder(), (encoder) =>
      runFfmpeg({ jobId: id, args: buildArgs(encoder), failureCode: 'subtitlesFailed', onProgress: reportProgress, workingFolder: folder }),
    );
    const bytesAfter = output.partialBytes();
    return { output: output.commit(), bytesBefore, bytesAfter };
  });
}

/** Copies the streams, so it is instant and loses nothing. MP4 only accepts its own subtitle format. */
function addTrack({ request, context, folder, bytesBefore }: SubtitleWork): Promise<JobResult> {
  const { path } = request;
  const { id, outputFolder, reportProgress } = context;
  const isMp4 = MP4_EXTENSIONS.includes(extensionOf(path));
  const output = new PendingOutput({ source: path, suffix: t.fileSuffixes.subtitled, extension: isMp4 ? 'mp4' : 'mkv', folder: outputFolder });
  const args = [
    '-i', path, '-i', SUBTITLES_FILE,
    '-map', '0:v', '-map', '0:a?', '-map', '1:0',
    '-c', 'copy', '-c:s', isMp4 ? 'mov_text' : 'srt',
    '-metadata:s:s:0', `title=${t.exportFormats.srt}`,
    output.partialPath,
  ];
  return withPendingOutput(output, async () => {
    await runFfmpeg({ jobId: id, args, failureCode: 'subtitlesFailed', onProgress: reportProgress, workingFolder: folder });
    const bytesAfter = output.partialBytes();
    return { output: output.commit(), bytesBefore, bytesAfter };
  });
}

function saveFile({ path, segments, voiceNames }: VideoRequest, { outputFolder }: JobContext, bytesBefore: number): Promise<JobResult> {
  // Same name as the video, so players load it on their own.
  const output = new PendingOutput({ source: path, suffix: '', extension: 'srt', folder: outputFolder });
  return withPendingOutput(output, async () => {
    writeFileSync(output.partialPath, toSrt(segments, voiceNames));
    const bytesAfter = output.partialBytes();
    return { output: output.commit(), bytesBefore, bytesAfter };
  });
}

export const addSubtitles: JobProcessor<'video.subtitles'> = async (request, context) => {
  const { path, segments, voiceNames, options } = request;
  if (!segments.length) throw new AppError('noSpeechFound');
  const bytesBefore = statSync(path).size;
  if (options.mode === 'file') return saveFile(request, context, bytesBefore);

  const media = await probeMedia(path);
  if (!media.videoCodec) throw new AppError('noVideoStream');
  const folder = jobTempFolder(context.id);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, SUBTITLES_FILE), toSrt(segments, voiceNames));
  try {
    const write = options.mode === 'burn' ? burn : addTrack;
    return await write({ request, context, media, folder, bytesBefore });
  } finally {
    removeJobTempFolder(context.id);
  }
};
