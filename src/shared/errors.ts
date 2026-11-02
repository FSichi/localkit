// Typed application errors. The main process throws a code; the UI turns it into a message,
// so user-facing text stays in the i18n catalog and never travels through IPC.

export type AppErrorCode =
  | 'cancelled'
  | 'unknown'
  | 'fileUnreadable'
  | 'noAudioStream'
  | 'noVideoStream'
  | 'compressFailed'
  | 'convertFailed'
  | 'trimFailed'
  | 'trimRangeInvalid'
  | 'subtitlesFailed'
  | 'noSpeechFound'
  | 'pdfEncrypted'
  | 'pdfUnreadable'
  | 'pageRangeSyntax'
  | 'pageRangeBounds'
  | 'pageRangeEmpty'
  | 'markdownUnreadable'
  | 'markdownTooLarge'
  | 'recordingAlreadyActive'
  | 'recordingNotActive'
  | 'screenRecordingFailed'
  | 'modelDownloadFailed'
  | 'updateNotInstalled'
  | 'updateRecordingActive'
  | 'updateNotAvailable'
  | 'updateAssetsMissing'
  | 'updateDownloadFailed'
  | 'updateChecksumMismatch'
  | 'updateCheckFailed';

const WIRE_PREFIX = 'app-error:';
const WIRE_PATTERN = /app-error:([A-Za-z]+)(?:\|(.*))?$/s;

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly detail?: string;

  constructor(code: AppErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'AppError';
    this.code = code;
    this.detail = detail;
  }
}

/** Electron flattens rejected IPC errors to a string, so the code travels inside the message. */
export function encodeErrorForIpc(error: unknown): string {
  if (error instanceof AppError) return `${WIRE_PREFIX}${error.code}${error.detail ? `|${error.detail}` : ''}`;
  return `${WIRE_PREFIX}unknown|${error instanceof Error ? error.message : String(error)}`;
}

export function decodeIpcError(error: unknown): { code: AppErrorCode; detail?: string } {
  if (error instanceof AppError) return { code: error.code, detail: error.detail };
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(WIRE_PATTERN);
  return match ? { code: match[1] as AppErrorCode, detail: match[2] } : { code: 'unknown', detail: message };
}
