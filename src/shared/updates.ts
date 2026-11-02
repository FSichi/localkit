import type { ReleaseSection } from './changelog.ts';

export interface PublishedAsset {
  name: string;
  url: string;
  bytes: number;
}

export interface PublishedRelease {
  version: string;
  publishedAt: string | null;
  url: string;
  sections: ReleaseSection[];
  installer: PublishedAsset | null;
  checksum: PublishedAsset | null;
}

export interface UpdateInfo {
  currentVersion: string;
  latest: PublishedRelease | null;
  updateAvailable: boolean;
  /** False when running from source: it cannot update itself. */
  installed: boolean;
}

export interface UpdateProgress {
  phase: 'downloading' | 'verifying' | 'installing';
  doneBytes: number;
  totalBytes: number;
}
