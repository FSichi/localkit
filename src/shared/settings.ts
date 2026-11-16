import type { AudioSource, RecordingCapture } from './transcription.ts';

export type Theme = 'dark' | 'light' | 'system';

export interface Settings {
  theme: Theme;
  language: string;
  /** Empty until chosen: the app proposes the best one for the GPU. */
  modelId: string;
  ocrModelId: string;
  audioSource: AudioSource;
  recordingCapture: RecordingCapture;
  microphoneId: string;
  transcribeWhenDone: boolean;
  /** Experimental: tell the voices of different people apart. */
  separateVoices: boolean;
  recordingsFolder: string;
  /** Where tools save their output. Empty means next to the original. */
  outputFolder: string;
  checkForUpdates: boolean;
  /** Closing the window leaves the app in the notification area even with nothing to do. */
  keepInBackground: boolean;
  /** Last version the app opened with, to show what's new only once. */
  lastSeenVersion: string;
  /** New-version notice postponed with "Later". */
  postponedUpdate: { version: string; until: number } | null;
}
