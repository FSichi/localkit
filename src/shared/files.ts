// File classification, shared by the UI (what can be dropped where) and the main process.

export type FileKind = 'image' | 'video' | 'audio' | 'pdf' | 'other';
export type SupportedFileKind = Exclude<FileKind, 'other'>;

const EXTENSIONS: Record<SupportedFileKind, string[]> = {
  image: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'tif', 'tiff', 'svg', 'heic', 'heif'],
  video: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'm4v', 'mpg', 'mpeg', 'ts', '3gp'],
  audio: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma', 'aiff'],
  pdf: ['pdf'],
};

export function extensionOf(path: string): string {
  return path.match(/\.([^.\\/]+)$/)?.[1]?.toLowerCase() ?? '';
}

export function fileKindOf(path: string): FileKind {
  const extension = extensionOf(path);
  for (const [kind, extensions] of Object.entries(EXTENSIONS)) {
    if (extensions.includes(extension)) return kind as FileKind;
  }
  return 'other';
}

export function extensionsFor(...kinds: SupportedFileKind[]): string[] {
  return kinds.flatMap((kind) => EXTENSIONS[kind]);
}

export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function withoutExtension(name: string): string {
  return name.replace(/\.[^.\\/]+$/, '');
}

export interface FileInfo {
  path: string;
  name: string;
  bytes: number;
  kind: FileKind;
  /** Small data URL for lists. */
  thumbnail?: string;
  width?: number;
  height?: number;
  duration?: number;
  pages?: number;
  isProtected?: boolean;
  videoCodec?: string;
  audioCodec?: string;
  unreadable?: boolean;
}
