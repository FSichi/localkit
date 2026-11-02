// Domain types for transcription, recording and the library.

export type Speaker = 'me' | 'others';
export type AudioSource = 'both' | 'system' | 'microphone';
export type RecordingCapture = 'audio' | 'screen';
export type ComputeProfile = 'gpu' | 'cpu';
export type TranscriptExportFormat = 'txt' | 'srt' | 'md' | 'pdf';

export interface Segment {
  start: number;
  end: number;
  text: string;
  speaker?: Speaker;
}

export interface LibraryItem {
  id: string;
  title: string;
  kind: 'file' | 'recording';
  createdAt: string;
  duration: number;
  /** Playable audio: the original file, or the recording's MP3. */
  audioPath?: string;
  /** Recordings only: raw tracks (left = microphone, right = system). */
  tracksPath?: string;
  /** Screen recordings only. */
  videoPath?: string;
  folder?: string;
  source?: AudioSource;
  language?: string;
  /** Display name of the quality used. */
  quality?: string;
  status: 'pending' | 'transcribed';
  segments: Segment[];
}

export type LibraryItemSummary = Omit<LibraryItem, 'segments'> & { wordCount: number; snippet?: string };

export interface ModelState {
  id: string;
  downloaded: boolean;
  bytes: number;
}

export interface ModelDownloadProgress {
  modelId: string;
  doneBytes: number;
  totalBytes: number;
}

export interface PreparedTrack {
  url: string;
  speaker?: Speaker;
  duration: number;
}

export interface PreparationProgress {
  jobId: string;
  fraction: number;
}

/** A screen or window that can be recorded. */
export interface CaptureSource {
  id: string;
  name: string;
  isScreen: boolean;
  thumbnail: string;
}

export interface RecordingStarted {
  id: string;
  folder: string;
}
