// The single contract between the main process and the UI.
// Adding a channel here is all the preload needs: the bridge is generic and fully typed.
import type { TimeRange } from './audio-edit.ts';
import type { FileInfo } from './files.ts';
import type { ImageOptions, JobProgress, JobRequest, JobResult } from './jobs.ts';
import type { MarkdownDocument } from './markdown.ts';
import type { Settings } from './settings.ts';
import type {
  AudioSource,
  CaptureSource,
  ComputeProfile,
  LibraryItem,
  LibraryItemSummary,
  ModelDownloadProgress,
  ModelState,
  PreparationProgress,
  PreparedTrack,
  RecordingCapture,
  RecordingStarted,
  TranscriptExportFormat,
} from './transcription.ts';
import type { UpdateInfo, UpdateProgress } from './updates.ts';

export interface AppBootstrap {
  settings: Settings;
  version: string;
}

export type BinaryOrText = Uint8Array | string;

/** Request/response channels: [arguments, result]. */
export interface InvokeContract {
  'app:bootstrap': [[], AppBootstrap];
  /** The file Windows asked the app to open when launching it. */
  'app:initialFile': [[], string | null];
  'settings:update': [[changes: Partial<Settings>], Settings];

  'dialog:pickFolder': [[], string | null];
  'dialog:pickFiles': [[extensions: string[]], string[]];
  'dialog:pickSavePath': [[defaultName: string, extension: string], string | null];

  'shell:showItem': [[path: string], void];
  'shell:openPath': [[path: string], void];
  'shell:openGitHub': [[url: string], void];

  'files:exists': [[path: string], boolean];
  'files:info': [[path: string], FileInfo];
  'files:mediaUrl': [[path: string], string];
  'files:previewUrl': [[path: string], string];
  'files:saveAs': [[defaultName: string, extension: string, data: BinaryOrText], string | null];
  'files:writeToFolder': [[folder: string, name: string, extension: string, data: BinaryOrText], void];

  'clipboard:writeText': [[text: string], void];
  'clipboard:writeImage': [[dataUrl: string], void];

  'jobs:run': [[id: string, request: JobRequest, outputFolder: string | null], JobResult];
  'jobs:cancel': [[id: string], void];
  'images:estimate': [[path: string, options: ImageOptions], number];
  'audio:waveform': [[path: string, points: number], number[]];

  'markdown:read': [[path: string], MarkdownDocument];
  'markdown:exportPdf': [[title: string, body: string], string | null];

  'models:list': [[profile: ComputeProfile], ModelState[]];
  'models:download': [[id: string, profile: ComputeProfile], void];
  'models:cancelDownload': [[id: string], void];
  'models:delete': [[id: string], void];
  'models:openFolder': [[], void];

  'transcription:prepare': [[jobId: string, path: string, source?: AudioSource], PreparedTrack[]];
  'transcription:cancelPreparation': [[jobId: string], void];
  'transcription:cleanup': [[jobId: string], void];

  'library:list': [[query: string], LibraryItemSummary[]];
  'library:get': [[id: string], LibraryItem];
  'library:create': [[item: Omit<LibraryItem, 'id'>], LibraryItem];
  'library:update': [[id: string, changes: Partial<LibraryItem>], LibraryItem];
  'library:delete': [[id: string], void];
  'library:exportTranscript': [[id: string, format: TranscriptExportFormat, withTimestamps: boolean], string | null];
  'library:exportAudio': [[id: string], string | null];
  /** A new pending item with the parts removed. */
  'library:createEdited': [[id: string, cuts: TimeRange[]], LibraryItem];

  'capture:listSources': [[], CaptureSource[]];
  'capture:selectSource': [[id: string | null], void];

  'recording:start': [[source: AudioSource, capture: RecordingCapture], RecordingStarted];
  'recording:stop': [[id: string, duration: number], LibraryItem];
  'recording:discard': [[id: string], void];
  'recording:recover': [[], number];

  'updates:check': [[force: boolean], UpdateInfo];
  'updates:install': [[], void];
}

/** Fire-and-forget channels from the UI. */
export interface SendContract {
  'recording:chunk': [id: string, data: Uint8Array];
}

/** Events pushed from the main process. */
export interface EventContract {
  'app:openFile': string;
  'models:progress': ModelDownloadProgress;
  'transcription:preparationProgress': PreparationProgress;
  'jobs:progress': JobProgress;
  'updates:progress': UpdateProgress;
}

export type InvokeChannel = keyof InvokeContract;
export type InvokeArgs<C extends InvokeChannel> = InvokeContract[C][0];
export type InvokeResult<C extends InvokeChannel> = InvokeContract[C][1];

export interface Bridge {
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>>;
  send<C extends keyof SendContract>(channel: C, ...args: SendContract[C]): void;
  on<C extends keyof EventContract>(channel: C, listener: (payload: EventContract[C]) => void): () => void;
  pathForFile(file: File): string;
}
