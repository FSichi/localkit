// File-processing jobs: what the UI asks for and what comes back.
// Adding a job means adding it to JobRequest and registering a processor in the main process;
// the compiler then enforces that the two stay in sync.
import type { OcrPage } from './ocr.ts';
import type { Segment, VoiceNames } from './transcription.ts';

export type ImageFormat = 'same' | 'webp' | 'avif' | 'jpeg' | 'png';

export interface ImageOptions {
  format: ImageFormat;
  /** 1 to 100. Ignored when lossless. */
  quality: number;
  lossless: boolean;
  /** Longest side in pixels; null keeps the original size. */
  maxSide: number | null;
  stripMetadata: boolean;
}

export type CompressionLevel = 'high' | 'medium' | 'low';
export type VideoCodec = 'h264' | 'h265';

export interface VideoCompressionOptions {
  mode: 'quality' | 'targetSize';
  level: CompressionLevel;
  /** Target size in MB, for "targetSize" mode. */
  targetMegabytes: number;
  /** Shortest side in pixels (0 = original). */
  resolution: number;
  codec: VideoCodec;
}

export const AUDIO_FORMATS = ['mp3', 'm4a', 'wav', 'flac', 'ogg'] as const;
export const VIDEO_FORMATS = ['mp4', 'webm', 'mkv', 'gif'] as const;
export type AudioFormat = (typeof AUDIO_FORMATS)[number];
export type VideoFormat = (typeof VIDEO_FORMATS)[number];
export type MediaFormat = AudioFormat | VideoFormat;

export interface TrimOptions {
  start: number;
  end: number;
  /** Re-encodes to cut on the exact frame; otherwise it is instant but snaps to a keyframe. */
  exact: boolean;
}

export type SubtitleMode = 'burn' | 'track' | 'file';
export type SubtitleSize = 'small' | 'medium' | 'large';

export interface SubtitleOptions {
  mode: SubtitleMode;
  /** Only for subtitles burned into the picture. */
  size: SubtitleSize;
}

export type PdfSplitMode = 'ranges' | 'everyPage';
export type PdfPageLayout = 'a4' | 'imageSize';
export type PageImageFormat = 'png' | 'jpeg';
export type OcrOutputFormat = 'text' | 'searchablePdf';

export interface PageArrangement {
  /** Position in the original document. */
  index: number;
  /** Clockwise, on top of what the page already has. */
  rotation: number;
}

export type JobRequest =
  | { type: 'image.process'; path: string; options: ImageOptions }
  | { type: 'video.compress'; path: string; options: VideoCompressionOptions }
  | { type: 'media.convert'; path: string; format: MediaFormat }
  | { type: 'media.trim'; path: string; options: TrimOptions }
  | { type: 'video.subtitles'; path: string; segments: Segment[]; voiceNames?: VoiceNames; options: SubtitleOptions }
  | { type: 'pdf.compress'; path: string; level: CompressionLevel }
  | { type: 'pdf.split'; path: string; mode: PdfSplitMode; ranges: string }
  | { type: 'pdf.merge'; paths: string[]; output: string }
  | { type: 'pdf.fromImages'; paths: string[]; output: string; layout: PdfPageLayout }
  | { type: 'pdf.organize'; path: string; pages: PageArrangement[]; output: string }
  | { type: 'ocr.save'; path: string; format: OcrOutputFormat; text: string; pages: OcrPage[] };

export type JobType = JobRequest['type'];

export interface JobResult {
  /** Generated file; when there are several, the folder that holds them. */
  output: string | null;
  bytesBefore: number;
  bytesAfter: number;
  /** The job's purpose is to reduce size, so the savings are worth showing. */
  reducesSize?: boolean;
  /** The result was not smaller than the original, so nothing was saved. */
  noGain?: boolean;
  fileCount?: number;
}

export interface JobProgress {
  id: string;
  fraction: number;
}
