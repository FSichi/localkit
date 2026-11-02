// New versions: check on open, notice with release notes, and what's new after updating.
import { parseChangelog, type ReleaseNotes } from '../../../../shared/changelog.ts';
import type { UpdateInfo, UpdateProgress } from '../../../../shared/updates.ts';
import changelog from '../../../../../CHANGELOG.md?raw';
import { appStore, updateSettings } from '../../app/app-store.ts';
import { invoke, on } from '../../lib/bridge.ts';
import { createStore } from '../../lib/create-store.ts';
import { describeError } from '../../lib/errors.ts';

const POSTPONE_DAYS = 3;
const DAY_MS = 86400000;

interface UpdateState {
  info: UpdateInfo | null;
  checking: boolean;
  checkError: string;
  dialog: 'update' | 'notes' | null;
  notes: ReleaseNotes[];
  progress: UpdateProgress | null;
  installError: string;
}

export const updateStore = createStore<UpdateState>({
  info: null,
  checking: false,
  checkError: '',
  dialog: null,
  notes: [],
  progress: null,
  installError: '',
});

export const localReleaseNotes = () => parseChangelog(changelog);

export async function checkForUpdate(force = false) {
  updateStore.set({ checking: true, checkError: '' });
  try {
    const info = await invoke('updates:check', force);
    updateStore.set({ info, checking: false });
    return info;
  } catch (error) {
    updateStore.set({ checking: false, checkError: describeError(error) });
    return null;
  }
}

export function postponeUpdate() {
  const { info } = updateStore.get();
  if (info?.latest) updateSettings({ postponedUpdate: { version: info.latest.version, until: Date.now() + POSTPONE_DAYS * DAY_MS } });
  updateStore.set({ dialog: null });
}

export async function installUpdate() {
  const installer = updateStore.get().info?.latest?.installer;
  updateStore.set({ installError: '', progress: { phase: 'downloading', doneBytes: 0, totalBytes: installer?.bytes ?? 0 } });
  const unsubscribe = on('updates:progress', (progress) => updateStore.set({ progress }));
  try {
    await invoke('updates:install');
  } catch (error) {
    updateStore.set({ progress: null, installError: describeError(error) });
  } finally {
    unsubscribe();
  }
}

/** On open: what's new once after updating, then the notice if a new version exists. */
export async function startUpdateFlow() {
  const { settings, version } = appStore.get();
  if (settings.lastSeenVersion !== version) {
    await updateSettings({ lastSeenVersion: version });
    const notes = localReleaseNotes().find((entry) => entry.version === version);
    if (settings.lastSeenVersion && notes) updateStore.set({ dialog: 'notes', notes: [notes] });
  }
  if (!settings.checkForUpdates) return;
  const info = await checkForUpdate();
  if (!info?.updateAvailable || !info.latest) return;
  const { postponedUpdate } = settings;
  if (postponedUpdate?.version === info.latest.version && Date.now() < postponedUpdate.until) return;
  if (!updateStore.get().dialog) updateStore.set({ dialog: 'update' });
}
