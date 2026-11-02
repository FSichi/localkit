// Reads media information. Without an output FFmpeg exits with an error, but it prints the data anyway.
import { captureFfmpeg } from '../../core/ffmpeg.ts';

export interface MediaProbe {
  duration: number;
  width?: number;
  height?: number;
  videoCodec?: string;
  audioCodec?: string;
}

const THUMBNAIL_WIDTH = 128;

export async function probeMedia(path: string): Promise<MediaProbe> {
  const { stderr } = await captureFfmpeg(['-i', path]);
  const duration = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  const video = stderr.match(/Stream #.*?Video: (\w+).*?[, ](\d{2,5})x(\d{2,5})/);
  const audio = stderr.match(/Stream #.*?Audio: (\w+)/);
  return {
    duration: duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : 0,
    width: video ? Number(video[2]) : undefined,
    height: video ? Number(video[3]) : undefined,
    // MP3 cover art shows up as a one-image "video".
    videoCodec: video && !/mjpeg|png/.test(video[1]) ? video[1] : undefined,
    audioCodec: audio?.[1],
  };
}

export async function videoThumbnail(path: string, duration: number): Promise<string | undefined> {
  const seekTo = String(Math.min(1, duration / 2));
  const { stdout } = await captureFfmpeg(['-ss', seekTo, '-i', path, '-frames:v', '1', '-vf', `scale=${THUMBNAIL_WIDTH}:-2`, '-f', 'mjpeg', 'pipe:1'], true);
  return stdout.length ? `data:image/jpeg;base64,${stdout.toString('base64')}` : undefined;
}
