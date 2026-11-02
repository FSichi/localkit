// Compress, convert and trim video and audio.
import { statSync } from 'node:fs';
import { AppError } from '../../../shared/errors.ts';
import { extensionOf } from '../../../shared/files.ts';
import { t } from '../../../shared/i18n/index.ts';
import { AUDIO_FORMATS, type AudioFormat, type MediaFormat } from '../../../shared/jobs.ts';
import { runFfmpeg } from '../../core/ffmpeg.ts';
import type { JobProcessor } from '../../core/jobs.ts';
import { PendingOutput, withPendingOutput } from '../../core/output-files.ts';
import { probeMedia, type MediaProbe } from './media-probe.ts';
import { detectVideoEncoder, softwareEncoder, withEncoderFallback, type VideoEncoder } from './video-encoders.ts';

const DEFAULT_AUDIO_KBPS = 128;
const TARGET_SIZE_AUDIO_KBPS = 96;
const MIN_VIDEO_KBPS = 80;
const TARGET_SIZE_MARGIN = 0.96;
const KILOBITS_PER_MEGABYTE = 8000;
const BYTES_PER_MEGABYTE = 1e6;
/** Encoders drift from the requested bitrate; beyond this, the size is corrected with another pass. */
const TARGET_SIZE_TOLERANCE = 1.05;
const RETRY_MARGIN = 0.9;
const MAX_TARGET_SIZE_PASSES = 3;

/** Limits the short side, so a vertical video doesn't end up tiny. */
const scaleFilter = (side: number) => `scale='if(gt(iw,ih),-2,min(${side},iw))':'if(gt(iw,ih),min(${side},ih),-2)'`;

/** At very low bitrates a smaller picture looks far better than a blocky one. */
function resolutionForBitrate(kbps: number, requested: number, shortSide: number): number {
  if (requested) return requested;
  if (kbps < 300 && shortSide > 480) return 480;
  if (kbps < 800 && shortSide > 720) return 720;
  return 0;
}

export const compressVideo: JobProcessor<'video.compress'> = async ({ path, options }, { id, outputFolder, reportProgress }) => {
  const bytesBefore = statSync(path).size;
  const media = await probeMedia(path);
  if (!media.videoCodec) throw new AppError('noVideoStream');

  const targetSize = options.mode === 'targetSize';
  const audioKbps = targetSize ? TARGET_SIZE_AUDIO_KBPS : DEFAULT_AUDIO_KBPS;
  const budgetKbps = (options.targetMegabytes * KILOBITS_PER_MEGABYTE * TARGET_SIZE_MARGIN) / Math.max(1, media.duration);
  const videoKbps = Math.max(MIN_VIDEO_KBPS, Math.floor(budgetKbps - (media.audioCodec ? audioKbps : 0)));
  const shortSide = Math.min(media.height ?? 0, media.width ?? 0);
  const resolutionFor = (kbps: number) => (targetSize ? resolutionForBitrate(kbps, options.resolution, shortSide) : options.resolution);

  const output = new PendingOutput({ source: path, suffix: t.fileSuffixes.compressed, extension: 'mp4', folder: outputFolder });
  const buildArgs = (encoder: VideoEncoder, kbps: number) => [
    '-i', path,
    '-map', '0:v:0', '-map', '0:a?',
    ...(resolutionFor(kbps) ? ['-vf', scaleFilter(resolutionFor(kbps))] : []),
    ...(targetSize ? encoder.bitrateArgs(options.codec, kbps) : encoder.qualityArgs(options.codec, options.level)),
    ...(options.codec === 'h265' ? ['-tag:v', 'hvc1'] : []),
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', `${audioKbps}k`,
    '-movflags', '+faststart',
    output.partialPath,
  ];

  const encoderInUse = await detectVideoEncoder();
  const encode = (kbps: number) =>
    withEncoderFallback(encoderInUse, (encoder) =>
      runFfmpeg({ jobId: id, args: buildArgs(encoder, kbps), failureCode: 'compressFailed', onProgress: reportProgress }),
    );

  return withPendingOutput(output, async () => {
    await encode(videoKbps);
    // At very low bitrates the encoder hits its quality floor, so lowering the bitrate
    // also lowers the resolution (see resolutionForBitrate) on the following pass.
    const targetBytes = options.targetMegabytes * BYTES_PER_MEGABYTE;
    let kbps = videoKbps;
    for (let pass = 1; targetSize && pass < MAX_TARGET_SIZE_PASSES && output.partialBytes() > targetBytes * TARGET_SIZE_TOLERANCE; pass++) {
      kbps = Math.max(MIN_VIDEO_KBPS, Math.floor((kbps * targetBytes * RETRY_MARGIN) / output.partialBytes()));
      await encode(kbps);
    }
    const bytesAfter = output.partialBytes();
    if (bytesAfter >= bytesBefore) {
      output.discard();
      return { output: null, bytesBefore, bytesAfter: bytesBefore, noGain: true };
    }
    return { output: output.commit(), bytesBefore, bytesAfter, reducesSize: true };
  });
};

const isAudioFormat = (format: MediaFormat): format is AudioFormat => (AUDIO_FORMATS as readonly string[]).includes(format);

type ConversionArgs = (media: MediaProbe, encoder: VideoEncoder) => string[];

/** Whenever the codecs already fit, streams are copied: it is instant and lossless. */
const CONVERSIONS: Record<MediaFormat, ConversionArgs> = {
  mp3: ({ audioCodec }) => (audioCodec === 'mp3' ? ['-vn', '-c:a', 'copy'] : ['-vn', '-c:a', 'libmp3lame', '-q:a', '2']),
  m4a: ({ audioCodec }) => (audioCodec === 'aac' ? ['-vn', '-c:a', 'copy'] : ['-vn', '-c:a', 'aac', '-b:a', '192k']),
  wav: () => ['-vn', '-c:a', 'pcm_s16le'],
  flac: () => ['-vn', '-c:a', 'flac'],
  ogg: () => ['-vn', '-c:a', 'libopus', '-b:a', '128k'],
  gif: () => ['-an', '-vf', 'fps=12,scale=480:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4'],
  mkv: () => ['-map', '0', '-c', 'copy'],
  webm: ({ videoCodec, audioCodec }) =>
    /^(vp8|vp9|av1)$/.test(videoCodec ?? '') && /^(opus|vorbis)$/.test(audioCodec ?? 'opus')
      ? ['-c', 'copy']
      : ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1', '-cpu-used', '4', '-c:a', 'libopus', '-b:a', '128k'],
  mp4: ({ videoCodec, audioCodec }, encoder) => [
    ...(/^(h264|hevc)$/.test(videoCodec ?? '') ? ['-c:v', 'copy'] : [...encoder.qualityArgs('h264', 'high'), '-pix_fmt', 'yuv420p']),
    ...(/^(aac|mp3)$/.test(audioCodec ?? 'aac') ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '160k']),
    '-movflags', '+faststart',
  ],
};

export const convertMedia: JobProcessor<'media.convert'> = async ({ path, format }, { id, outputFolder, reportProgress }) => {
  const bytesBefore = statSync(path).size;
  const media = await probeMedia(path);
  if (isAudioFormat(format) && !media.audioCodec) throw new AppError('noAudioStream');
  if (!isAudioFormat(format) && !media.videoCodec) throw new AppError('noVideoStream');

  const suffix = extensionOf(path) === format ? t.fileSuffixes.converted : '';
  const output = new PendingOutput({ source: path, suffix, extension: format, folder: outputFolder });
  return withPendingOutput(output, async () => {
    await withEncoderFallback(await detectVideoEncoder(), (encoder) =>
      runFfmpeg({ jobId: id, args: ['-i', path, ...CONVERSIONS[format](media, encoder), output.partialPath], failureCode: 'convertFailed', onProgress: reportProgress }),
    );
    const bytesAfter = output.partialBytes();
    return { output: output.commit(), bytesBefore, bytesAfter };
  });
};

export const trimMedia: JobProcessor<'media.trim'> = async ({ path, options }, { id, outputFolder, reportProgress }) => {
  const { start, end, exact } = options;
  if (end <= start) throw new AppError('trimRangeInvalid');
  const bytesBefore = statSync(path).size;
  const media = await probeMedia(path);
  const output = new PendingOutput({ source: path, suffix: t.fileSuffixes.trimmed, extension: extensionOf(path) || 'mp4', folder: outputFolder });
  const range = ['-ss', start.toFixed(3), '-t', (end - start).toFixed(3)];

  const buildArgs = (encoder: VideoEncoder) => {
    if (!exact) return [...range, '-i', path, '-map', '0', '-c', 'copy', '-avoid_negative_ts', 'make_zero', output.partialPath];
    const video = media.videoCodec ? [...encoder.qualityArgs('h264', 'high'), '-pix_fmt', 'yuv420p'] : [];
    return ['-i', path, ...range, ...video, output.partialPath];
  };

  return withPendingOutput(output, async () => {
    const encoder = exact && media.videoCodec ? await detectVideoEncoder() : softwareEncoder;
    await withEncoderFallback(encoder, (current) =>
      runFfmpeg({ jobId: id, args: buildArgs(current), failureCode: 'trimFailed', onProgress: reportProgress, knownDuration: end - start }),
    );
    const bytesAfter = output.partialBytes();
    return { output: output.commit(), bytesBefore, bytesAfter };
  });
};
