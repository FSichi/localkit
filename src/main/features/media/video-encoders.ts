// Picks the video encoder: each accelerator is a strategy, with the CPU as the last resort.
import { AppError } from '../../../shared/errors.ts';
import type { CompressionLevel, VideoCodec } from '../../../shared/jobs.ts';
import { captureFfmpeg } from '../../core/ffmpeg.ts';

type QualityScale = Record<CompressionLevel, number>;

/** Constant quality: lower is better and heavier. */
const QUALITY: Record<VideoCodec, { software: QualityScale; hardware: QualityScale }> = {
  h264: { software: { high: 21, medium: 25, low: 30 }, hardware: { high: 23, medium: 28, low: 33 } },
  h265: { software: { high: 24, medium: 28, low: 33 }, hardware: { high: 26, medium: 31, low: 36 } },
};

const CODEC_FAMILY: Record<VideoCodec, string> = { h264: 'h264', h265: 'hevc' };
const SOFTWARE_ENCODER: Record<VideoCodec, string> = { h264: 'libx264', h265: 'libx265' };

const bitrateCap = (kbps: number) => ['-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.4)}k`, '-bufsize', `${kbps * 2}k`];

export interface VideoEncoder {
  name: string;
  qualityArgs(codec: VideoCodec, level: CompressionLevel): string[];
  bitrateArgs(codec: VideoCodec, kbps: number): string[];
}

const softwareEncoder: VideoEncoder = {
  name: 'cpu',
  qualityArgs: (codec, level) => ['-c:v', SOFTWARE_ENCODER[codec], '-preset', 'medium', '-crf', String(QUALITY[codec].software[level])],
  bitrateArgs: (codec, kbps) => ['-c:v', SOFTWARE_ENCODER[codec], '-preset', 'medium', ...bitrateCap(kbps)],
};

const nvencEncoder: VideoEncoder = {
  name: 'nvenc',
  qualityArgs: (codec, level) => ['-c:v', `${CODEC_FAMILY[codec]}_nvenc`, '-preset', 'p5', '-rc', 'vbr', '-cq', String(QUALITY[codec].hardware[level]), '-b:v', '0'],
  // Constant bitrate: VBR overshoots on complex clips, and a size limit has to be respected.
  bitrateArgs: (codec, kbps) => ['-c:v', `${CODEC_FAMILY[codec]}_nvenc`, '-preset', 'p5', '-rc', 'cbr', '-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 2}k`],
};

const amfEncoder: VideoEncoder = {
  name: 'amf',
  qualityArgs: (codec, level) => {
    const quality = String(QUALITY[codec].hardware[level]);
    return ['-c:v', `${CODEC_FAMILY[codec]}_amf`, '-quality', 'balanced', '-rc', 'cqp', '-qp_i', quality, '-qp_p', quality];
  },
  bitrateArgs: (codec, kbps) => ['-c:v', `${CODEC_FAMILY[codec]}_amf`, ...bitrateCap(kbps)],
};

const qsvEncoder: VideoEncoder = {
  name: 'qsv',
  qualityArgs: (codec, level) => ['-c:v', `${CODEC_FAMILY[codec]}_qsv`, '-global_quality', String(QUALITY[codec].hardware[level])],
  bitrateArgs: (codec, kbps) => ['-c:v', `${CODEC_FAMILY[codec]}_qsv`, ...bitrateCap(kbps)],
};

const HARDWARE_ENCODERS = [nvencEncoder, amfEncoder, qsvEncoder];

let detected: Promise<VideoEncoder> | null = null;

/** Tests which hardware encoder really works on this PC. */
export function detectVideoEncoder(): Promise<VideoEncoder> {
  detected ??= (async () => {
    for (const encoder of HARDWARE_ENCODERS) {
      const args = ['-f', 'lavfi', '-i', 'color=black:s=320x240:d=0.1', ...encoder.qualityArgs('h264', 'medium').slice(0, 2), '-f', 'null', '-'];
      if ((await captureFfmpeg(args)).exitCode === 0) return encoder;
    }
    return softwareEncoder;
  })();
  return detected;
}

/** Runs with the given encoder and, if the GPU fails midway, retries on the CPU. */
export async function withEncoderFallback(encoder: VideoEncoder, attempt: (encoder: VideoEncoder) => Promise<void>) {
  try {
    await attempt(encoder);
  } catch (error) {
    if (encoder === softwareEncoder || (error instanceof AppError && error.code === 'cancelled')) throw error;
    console.warn(`Encoding with ${encoder.name} failed; falling back to the CPU.`, error);
    await attempt(softwareEncoder);
  }
}

export { softwareEncoder };
