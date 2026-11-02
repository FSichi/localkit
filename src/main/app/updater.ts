// Checks GitHub releases for new versions and updates the installed app.
// Besides model downloads, this is the only thing the app asks the internet, and it can be disabled.
import { app, net } from 'electron';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, mkdirSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareVersions, parseReleaseBody } from '../../shared/changelog.ts';
import { AppError } from '../../shared/errors.ts';
import type { PublishedAsset, PublishedRelease, UpdateInfo, UpdateProgress } from '../../shared/updates.ts';
import { handle, type AppContext } from './ipc.ts';

const REPOSITORY = 'FSichi/localkit';
const CACHE_MS = 6 * 60 * 60 * 1000;
const PROGRESS_STEP_BYTES = 1e6;
const QUIT_DELAY_MS = 1500;
// The app downloads this exact asset name; keep it in sync with electron-builder.yml.
const INSTALLER_PATTERN = /^LocalKit-Setup-.+\.exe$/i;
const CHECKSUM_PATTERN = /^LocalKit-Setup-.+\.exe\.sha256$/i;

interface GitHubRelease {
  tag_name?: string;
  body?: string;
  published_at?: string;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: { name: string; browser_download_url: string; size: number }[];
}

let cache: { until: number; info: UpdateInfo } | null = null;

function toPublishedRelease(release: GitHubRelease): PublishedRelease {
  const findAsset = (pattern: RegExp): PublishedAsset | null => {
    const asset = (release.assets ?? []).find((candidate) => pattern.test(candidate.name));
    return asset ? { name: asset.name, url: asset.browser_download_url, bytes: asset.size } : null;
  };
  return {
    version: String(release.tag_name ?? '').replace(/^v/i, ''),
    publishedAt: release.published_at ?? null,
    url: release.html_url,
    sections: parseReleaseBody(release.body ?? ''),
    installer: findAsset(INSTALLER_PATTERN),
    checksum: findAsset(CHECKSUM_PATTERN),
  };
}

async function checkForUpdate(force: boolean): Promise<UpdateInfo> {
  if (!force && cache && Date.now() < cache.until) return cache.info;
  const response = await net.fetch(`https://api.github.com/repos/${REPOSITORY}/releases?per_page=20`, {
    headers: { 'User-Agent': `LocalKit/${app.getVersion()}`, Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new AppError('updateCheckFailed', String(response.status));
  const releases = (await response.json()) as GitHubRelease[];
  const versions = releases
    .filter((release) => !release.draft && !release.prerelease && /^v?\d+\.\d+\.\d+/.test(release.tag_name ?? ''))
    .map(toPublishedRelease)
    .sort((a, b) => compareVersions(b.version, a.version));
  const latest = versions[0] ?? null;
  const info: UpdateInfo = {
    currentVersion: app.getVersion(),
    latest,
    updateAvailable: Boolean(latest && compareVersions(latest.version, app.getVersion()) > 0),
    installed: app.isPackaged,
  };
  cache = { until: Date.now() + CACHE_MS, info };
  return info;
}

async function downloadInstaller(asset: PublishedAsset, target: string, report: (progress: UpdateProgress) => void) {
  const response = await net.fetch(asset.url);
  if (!response.ok || !response.body) throw new AppError('updateDownloadFailed', String(response.status));
  const hash = createHash('sha256');
  const output = createWriteStream(target);
  let doneBytes = 0;
  let lastReported = 0;
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      doneBytes += value.byteLength;
      if (!output.write(value)) await new Promise((resolve) => output.once('drain', resolve));
      if (doneBytes - lastReported > PROGRESS_STEP_BYTES) {
        lastReported = doneBytes;
        report({ phase: 'downloading', doneBytes, totalBytes: asset.bytes });
      }
    }
  } finally {
    await new Promise((resolve) => output.end(resolve));
  }
  return hash.digest('hex');
}

/**
 * Downloads the installer, verifies its SHA-256 against the one published in the same release,
 * runs it silently and quits. The installer replaces the files and reopens the app (--force-run).
 * It never touches the library, recordings or models, which live outside the app folder.
 */
async function installUpdate(report: (progress: UpdateProgress) => void, isBusy: () => boolean) {
  if (!app.isPackaged) throw new AppError('updateNotInstalled');
  if (isBusy()) throw new AppError('updateRecordingActive');
  const { updateAvailable, latest } = await checkForUpdate(true);
  if (!updateAvailable || !latest) throw new AppError('updateNotAvailable');
  const { installer, checksum } = latest;
  if (!installer || !checksum) throw new AppError('updateAssetsMissing');

  const folder = join(tmpdir(), 'LocalKit-update');
  mkdirSync(folder, { recursive: true });
  const target = join(folder, installer.name);
  const partial = `${target}.download`;
  const actualHash = await downloadInstaller(installer, partial, report);

  report({ phase: 'verifying', doneBytes: installer.bytes, totalBytes: installer.bytes });
  const expectedHash = (await (await net.fetch(checksum.url)).text()).trim().split(/\s+/)[0].toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expectedHash) || actualHash !== expectedHash) throw new AppError('updateChecksumMismatch');
  renameSync(partial, target);

  report({ phase: 'installing', doneBytes: installer.bytes, totalBytes: installer.bytes });
  spawn(target, ['/S', '--force-run', '--updated'], { detached: true, stdio: 'ignore' }).unref();
  // The app has to exit so the installer can replace its files.
  setTimeout(() => app.quit(), QUIT_DELAY_MS);
}

export function registerUpdaterIpc(context: AppContext, isBusy: () => boolean) {
  handle('updates:check', checkForUpdate);
  handle('updates:install', () => installUpdate((progress) => context.emit('updates:progress', progress), isBusy));
}
